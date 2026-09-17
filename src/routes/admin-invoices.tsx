import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { SUPER_ADMIN_EMAIL } from "@/lib/legal";
import { getPaddleEnvironment } from "@/lib/paddle";
import { listAdminInvoices } from "@/lib/admin-invoices.functions";

export const Route = createFileRoute("/admin-invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — C.A.T.H.Y. Owner Console" },
      {
        name: "description",
        content: "Owner-only ledger of every C.A.T.H.Y. company invoice, payment and cancellation.",
      },
      { property: "og:title", content: "Invoices — C.A.T.H.Y. Owner Console" },
      {
        property: "og:description",
        content: "Track paid, past-due and canceled invoices across all C.A.T.H.Y. accounts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminInvoices,
});

function money(minor: string, currency: string) {
  const n = Number(minor) / 100;
  if (!Number.isFinite(n)) return `${minor} ${currency}`;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

const STATUS_STYLES: Record<string, string> = {
  completed: "border-success/40 bg-success/15 text-success",
  paid: "border-success/40 bg-success/15 text-success",
  billed: "border-primary/40 bg-primary/10 text-primary",
  past_due: "border-destructive/40 bg-destructive/15 text-destructive",
  canceled: "border-border bg-muted/20 text-muted-foreground",
  draft: "border-border text-muted-foreground",
};

function AdminInvoices() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { isSuperAdmin: profileSuperAdmin, isLoading: profileLoading } = useProfile();
  const isOwner =
    profileSuperAdmin && (session?.user?.email ?? "").trim().toLowerCase() === SUPER_ADMIN_EMAIL;

  const [filter, setFilter] = useState<"all" | "paid" | "canceled">("all");
  const fetchInvoices = useServerFn(listAdminInvoices);

  useEffect(() => {
    if (!authLoading && !session) navigate({ to: "/admin-login" });
  }, [authLoading, session, navigate]);

  const invoicesQ = useQuery({
    queryKey: ["admin-invoices"],
    queryFn: () => fetchInvoices({ data: { environment: getPaddleEnvironment() } }),
    enabled: !!session && isOwner,
    refetchInterval: 60000,
  });

  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data]);

  const shown = useMemo(() => {
    if (filter === "paid") {
      return invoices.filter((i) => i.status === "completed" || i.status === "paid");
    }
    if (filter === "canceled") {
      return invoices.filter((i) => i.status === "canceled" || i.status === "past_due");
    }
    return invoices;
  }, [invoices, filter]);

  const collected = useMemo(
    () =>
      invoices
        .filter((i) => i.status === "completed" || i.status === "paid")
        .reduce((sum, i) => sum + Number(i.total) / 100, 0),
    [invoices],
  );

  if (authLoading || profileLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="font-display text-2xl font-bold uppercase">Restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Invoices are only visible to the platform owner.
        </p>
        <Link
          to="/admin-login"
          className="mt-4 inline-block text-sm font-semibold uppercase tracking-widest text-primary"
        >
          Owner sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="safe-top border-b border-border bg-surface/60">
        <div className="hazard-stripe h-1 w-full opacity-70" />
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4">
          <div>
            <h1 className="font-display text-xl font-bold uppercase">Invoices</h1>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {invoices.length} records · {money(String(Math.round(collected * 100)), "USD")} collected
            </p>
          </div>
          <Link
            to="/super-admin"
            className="text-xs font-semibold uppercase tracking-widest text-primary"
          >
            Company control
          </Link>
        </div>
      </header>

      <main className="safe-bottom mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex overflow-hidden rounded-md border border-primary">
          {(["all", "paid", "canceled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`min-h-12 flex-1 px-3 text-[11px] font-bold uppercase tracking-widest ${
                filter === f ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/10"
              }`}
            >
              {f === "all" ? "All" : f === "paid" ? "Paid" : "Canceled / past due"}
            </button>
          ))}
        </div>

        {invoicesQ.isLoading && <p className="text-sm text-muted-foreground">Loading invoices…</p>}
        {invoicesQ.error && (
          <p className="text-sm text-destructive">
            Could not load invoices. {(invoicesQ.error as Error).message}
          </p>
        )}

        <div className="space-y-3">
          {shown.map((inv) => (
            <article
              key={inv.id}
              className="panel flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {inv.companyName ?? inv.customerEmail ?? "Unlinked customer"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {inv.invoiceNumber ?? inv.id}
                  {inv.billedAt ? ` · ${new Date(inv.billedAt).toLocaleDateString()}` : ""}
                </p>
                {inv.subscriptionId && (
                  <p className="truncate text-[11px] uppercase tracking-widest text-muted-foreground">
                    Sub {inv.subscriptionId}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                    STATUS_STYLES[inv.status] ?? "border-border text-muted-foreground"
                  }`}
                >
                  {inv.status.replace(/_/g, " ")}
                </span>
                <span className="font-display text-lg font-bold">
                  {money(inv.total, inv.currency)}
                </span>
              </div>
            </article>
          ))}
          {!invoicesQ.isLoading && shown.length === 0 && (
            <p className="text-sm text-muted-foreground">No invoices in this view yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}

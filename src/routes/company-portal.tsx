import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

export const Route = createFileRoute("/company-portal")({
  head: () => ({
    meta: [
      { title: "Company Portal — C.A.T.H.Y." },
      {
        name: "description",
        content:
          "Account owner portal: review your company's equipment, crew records and inspection history in one place.",
      },
      { property: "og:title", content: "Company Portal — C.A.T.H.Y." },
      {
        property: "og:description",
        content: "Your company's assets, personnel and inspections in a single owner view.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompanyPortal,
});

type Tab = "assets" | "personnel" | "inspections";

interface AssetRow {
  id: string;
  asset_tag: string;
  name: string;
  status: string;
  current_location: string;
  site: string;
  zone: string;
  bin: string;
  serial_or_vin: string;
}

interface PersonRow {
  id: string;
  first_name: string;
  last_name: string;
  employee_id: string;
  trade_title: string;
  status: string;
}

interface InspectionRow {
  id: string;
  inspector_name: string;
  inspection_type: string;
  inspection_date: string;
  expiration_date: string;
  result: string;
  asset_id: string;
}

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function CompanyPortal() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { context, companyId, role, isSuperAdmin, isPastDue, graceDaysLeft, isLoading } =
    useProfile();
  const [tab, setTab] = useState<Tab>("assets");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!authLoading && !session) navigate({ to: "/auth" });
  }, [authLoading, session, navigate]);

  const allowed = isSuperAdmin || role === "company_admin" || role === "safety_director";

  const assetsQ = useQuery({
    queryKey: ["portal-assets", companyId],
    enabled: !!companyId && allowed,
    queryFn: async (): Promise<AssetRow[]> => {
      const { data, error } = await supabase
        .from("assets")
        .select("id, asset_tag, name, status, current_location, site, zone, bin, serial_or_vin")
        .eq("company_id", companyId!)
        .order("asset_tag");
      if (error) throw error;
      return (data ?? []) as AssetRow[];
    },
  });

  const peopleQ = useQuery({
    queryKey: ["portal-personnel", companyId],
    enabled: !!companyId && allowed,
    queryFn: async (): Promise<PersonRow[]> => {
      const { data, error } = await supabase
        .from("personnel_records")
        .select("id, first_name, last_name, employee_id, trade_title, status")
        .eq("company_id", companyId!)
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as PersonRow[];
    },
  });

  const inspectionsQ = useQuery({
    queryKey: ["portal-inspections", companyId],
    enabled: !!companyId && allowed,
    queryFn: async (): Promise<InspectionRow[]> => {
      const { data, error } = await supabase
        .from("inspections")
        .select(
          "id, inspector_name, inspection_type, inspection_date, expiration_date, result, asset_id",
        )
        .eq("company_id", companyId!).eq("status" as never, "final" as never)
        .order("inspection_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as InspectionRow[];
    },
  });

  if (authLoading || isLoading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-2xl font-bold uppercase">Owner access only</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The company portal is limited to the account owner and safety directors. Ask your account
          owner for access.
        </p>
        <Link
          to="/"
          className="touch-target rounded-md border border-primary px-5 py-3 text-sm font-semibold uppercase tracking-widest text-primary"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  const needle = q.trim().toLowerCase();
  const assets = (assetsQ.data ?? []).filter(
    (a) =>
      !needle ||
      `${a.asset_tag} ${a.name} ${a.serial_or_vin} ${a.current_location}`
        .toLowerCase()
        .includes(needle),
  );
  const people = (peopleQ.data ?? []).filter(
    (p) =>
      !needle ||
      `${p.first_name} ${p.last_name} ${p.employee_id} ${p.trade_title}`
        .toLowerCase()
        .includes(needle),
  );
  const assetTagById = new Map((assetsQ.data ?? []).map((a) => [a.id, a.asset_tag]));
  const inspections = (inspectionsQ.data ?? []).filter(
    (i) =>
      !needle ||
      `${i.inspector_name} ${i.inspection_type} ${assetTagById.get(i.asset_id) ?? ""}`
        .toLowerCase()
        .includes(needle),
  );

  const today = new Date().toISOString().slice(0, 10);
  const expired = (inspectionsQ.data ?? []).filter((i) => i.expiration_date < today).length;

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "assets", label: "Assets", count: assetsQ.data?.length ?? 0 },
    { key: "personnel", label: "Personnel", count: peopleQ.data?.length ?? 0 },
    { key: "inspections", label: "Inspections", count: inspectionsQ.data?.length ?? 0 },
  ];

  return (
    <div className="min-h-screen pb-24">
      <header className="safe-top no-print sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="hazard-stripe h-1 w-full opacity-70" />
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold uppercase leading-none">
              Company <span className="text-primary">Portal</span>
            </h1>
            <p className="mt-1 truncate text-[11px] uppercase tracking-widest text-muted-foreground">
              {context?.company?.name ?? "Your company"} — Compliance, Asset Tracking &amp; Heavy
              Yards
            </p>
          </div>
          <Link
            to="/"
            className="touch-target rounded-md border border-border px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:border-primary"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        {isPastDue && (
          <div className="rounded-lg border border-warning bg-warning/10 p-4 text-sm text-warning">
            Account Past Due — Compliance &amp; audit records kept safe in read-only mode
            {graceDaysLeft !== null && ` for ${graceDaysLeft} more day${graceDaysLeft === 1 ? "" : "s"}`}
            . Update payment to resume moves.
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-4">
          {tabs.map((t) => (
            <div key={t.key} className="rounded-lg border border-border bg-surface p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t.label}
              </p>
              <p className="mt-1 font-display text-3xl font-bold">{t.count}</p>
            </div>
          ))}
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Expired certs
            </p>
            <p className={`mt-1 font-display text-3xl font-bold ${expired ? "text-warning" : ""}`}>
              {expired}
            </p>
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`touch-target rounded-md border px-4 py-3 text-xs font-semibold uppercase tracking-widest ${
                tab === t.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tag, serial, crew or inspector…"
          className="h-12 w-full rounded-md border border-border bg-surface px-4 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />

        {tab === "assets" && (
          <section className="space-y-2">
            {assetsQ.isLoading && <p className="text-sm text-muted-foreground">Loading assets…</p>}
            {!assetsQ.isLoading && assets.length === 0 && (
              <p className="text-sm text-muted-foreground">No equipment matches this search.</p>
            )}
            {assets.map((a) => (
              <article key={a.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs uppercase text-primary">{a.asset_tag}</p>
                    <p className="truncate font-semibold">{a.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {a.site} &gt; {a.zone} &gt; {a.bin}
                    </p>
                  </div>
                  <span className="rounded border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-widest">
                    {a.status}
                  </span>
                </div>
              </article>
            ))}
          </section>
        )}

        {tab === "personnel" && (
          <section className="space-y-2">
            {peopleQ.isLoading && <p className="text-sm text-muted-foreground">Loading crew…</p>}
            {!peopleQ.isLoading && people.length === 0 && (
              <p className="text-sm text-muted-foreground">No crew records match this search.</p>
            )}
            {people.map((p) => (
              <article
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {p.first_name} {p.last_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.trade_title} · #{p.employee_id}
                  </p>
                </div>
                <span className="rounded border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-widest">
                  {p.status}
                </span>
              </article>
            ))}
          </section>
        )}

        {tab === "inspections" && (
          <section className="space-y-2">
            {inspectionsQ.isLoading && (
              <p className="text-sm text-muted-foreground">Loading inspections…</p>
            )}
            {!inspectionsQ.isLoading && inspections.length === 0 && (
              <p className="text-sm text-muted-foreground">No inspections match this search.</p>
            )}
            {inspections.map((i) => {
              const isExpired = i.expiration_date < today;
              return (
                <article key={i.id} className="rounded-lg border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs uppercase text-primary">
                        {assetTagById.get(i.asset_id) ?? "—"}
                      </p>
                      <p className="truncate font-semibold">{i.inspection_type}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {i.inspector_name} · {fmt(i.inspection_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="rounded border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-widest">
                        {i.result}
                      </span>
                      <p
                        className={`mt-1 text-[11px] uppercase tracking-widest ${
                          isExpired ? "text-warning" : "text-muted-foreground"
                        }`}
                      >
                        {isExpired ? "Expired" : "Expires"} {fmt(i.expiration_date)}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            to="/audit-binder"
            className="touch-target rounded-md border border-border px-4 py-3 text-sm font-semibold uppercase tracking-widest hover:border-primary"
          >
            Audit binder
          </Link>
          <Link
            to="/account"
            className="touch-target rounded-md border border-border px-4 py-3 text-sm font-semibold uppercase tracking-widest hover:border-primary"
          >
            My account
          </Link>
        </div>
      </main>
    </div>
  );
}

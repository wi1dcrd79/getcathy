import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

export const Route = createFileRoute("/super-admin")({
  head: () => ({
    meta: [
      { title: "Company Control — CertVault Industries" },
      {
        name: "description",
        content: "Super-admin console for managing CertVault Industries company accounts, plans and crew seats.",
      },
      { property: "og:title", content: "Company Control — CertVault Industries" },
      {
        property: "og:description",
        content: "Manage CertVault Industries company accounts, subscription tiers and seat counts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SuperAdmin,
});

interface CompanyRow {
  id: string;
  name: string;
  subscription_tier: string;
  subscription_status: string;
  seat_limit: number;
  created_at: string;
}

async function fetchCompanies(): Promise<CompanyRow[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, subscription_tier, subscription_status, seat_limit, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CompanyRow[];
}

function SuperAdmin() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { isSuperAdmin, isLoading: profileLoading } = useProfile();
  const qc = useQueryClient();

  useEffect(() => {
    if (!authLoading && !session) navigate({ to: "/auth" });
  }, [authLoading, session, navigate]);

  const companiesQ = useQuery({
    queryKey: ["companies"],
    queryFn: fetchCompanies,
    enabled: !!session && isSuperAdmin,
  });

  const update = useMutation({
    mutationFn: async (vars: { id: string; tier?: string; seats?: number }) => {
      const patch: Record<string, unknown> = {};
      if (vars.tier !== undefined) {
        patch['subscription_tier'] = vars.tier;
        patch['seat_limit'] = vars.tier === "free" ? 1 : 5;
      }
      if (vars.seats !== undefined) patch['seat_limit'] = vars.seats;
      const { error } = await supabase.from("companies").update(patch as never).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
  });

  if (authLoading || profileLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="font-display text-2xl font-bold uppercase">Restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This console is only available to the platform owner.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm font-semibold uppercase tracking-widest text-primary">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const companies = companiesQ.data ?? [];

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface/60">
        <div className="hazard-stripe h-1 w-full opacity-70" />
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="font-display text-xl font-bold uppercase">Company Control</h1>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {companies.length} accounts
            </p>
          </div>
          <Link to="/" className="text-xs font-semibold uppercase tracking-widest text-primary">
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {companiesQ.isLoading && <p className="text-sm text-muted-foreground">Loading companies…</p>}
        {companiesQ.error && <p className="text-sm text-destructive">Could not load companies.</p>}

        <div className="space-y-3">
          {companies.map((c) => (
            <article key={c.id} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.subscription_status} · {c.seat_limit} seat{c.seat_limit === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                    c.subscription_tier === "free"
                      ? "border-border text-muted-foreground"
                      : "border-success/40 bg-success/15 text-success"
                  }`}
                >
                  {c.subscription_tier}
                </span>
                <button
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({ id: c.id, tier: c.subscription_tier === "free" ? "pro" : "free" })
                  }
                  className="rounded-md border border-primary px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-primary disabled:opacity-50"
                >
                  {c.subscription_tier === "free" ? "Upgrade to Pro" : "Downgrade to Free"}
                </button>
                <label className="flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground">
                  Seats
                  <input
                    type="number"
                    min={1}
                    defaultValue={c.seat_limit}
                    onBlur={(e) => {
                      const seats = Number(e.target.value);
                      if (seats >= 1 && seats !== c.seat_limit) update.mutate({ id: c.id, seats });
                    }}
                    className="w-16 rounded-md border border-border bg-input px-2 py-1 text-sm text-foreground"
                  />
                </label>
              </div>
            </article>
          ))}
          {!companiesQ.isLoading && companies.length === 0 && (
            <p className="text-sm text-muted-foreground">No companies yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}

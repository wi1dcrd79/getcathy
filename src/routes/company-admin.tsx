import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { planFor } from "@/lib/plans";

export const Route = createFileRoute("/company-admin")({
  head: () => ({
    meta: [
      { title: "Admin Console — C.A.T.H.Y." },
      {
        name: "description",
        content:
          "Company admin console for C.A.T.H.Y.: manage crew seats, roles, company details and subscription status.",
      },
      { property: "og:title", content: "Admin Console — C.A.T.H.Y." },
      {
        property: "og:description",
        content: "Manage your crew seats, roles and subscription in the C.A.T.H.Y. admin console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompanyAdmin,
});

const ASSIGNABLE_ROLES = [
  { value: "company_admin", label: "Company Admin" },
  { value: "safety_director", label: "Safety Director" },
  { value: "qc_inspector", label: "QC Inspector" },
  { value: "operator", label: "Operator" },
  { value: "field_tech", label: "Field Tech" },
  { value: "viewer", label: "Viewer" },
];

interface TeamMember {
  id: string;
  email: string | null;
  role: string;
  created_at: string;
}

interface BillingRow {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

function CompanyAdmin() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const {
    context,
    companyId,
    isPro,
    isSuperAdmin,
    role,
    isPastDue,
    graceDaysLeft,
    isLoading: profileLoading,
  } = useProfile();

  const isCompanyAdmin = isSuperAdmin || role === "company_admin";
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !session) navigate({ to: "/auth" });
  }, [authLoading, session, navigate]);

  const teamQ = useQuery({
    queryKey: ["company-team", companyId],
    enabled: !!session && !!companyId && isCompanyAdmin && isPro,
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, role, created_at")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TeamMember[];
    },
  });

  const billingQ = useQuery({
    queryKey: ["company-billing-state", companyId],
    enabled: !!session && !!companyId && isCompanyAdmin && isPro,
    queryFn: async (): Promise<BillingRow | null> => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("status, current_period_end, cancel_at_period_end")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] as unknown as BillingRow) ?? null;
    },
  });

  const setRole = useMutation({
    mutationFn: async (vars: { id: string; role: string }) => {
      setSavingId(vars.id);
      const { error } = await supabase
        .from("profiles")
        .update({ role: vars.role } as never)
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSettled: () => {
      setSavingId(null);
      qc.invalidateQueries({ queryKey: ["company-team", companyId] });
    },
  });

  const renameCompany = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from("companies")
        .update({ name } as never)
        .eq("id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-context"] }),
  });

  if (authLoading || profileLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }

  if (!isCompanyAdmin) {
    return (
      <Gate
        title="Admins only"
        body="The admin console is available to your company admin. Ask them to change your role if you need access."
      />
    );
  }

  if (!isPro) {
    return (
      <Gate
        title="Included with Field Yard Pro"
        body="The private admin console — crew seats, role control and subscription detail — unlocks on Field Yard Pro ($279/mo) and Enterprise Contractor ($699/mo)."
      />
    );
  }

  const company = context?.company ?? null;
  const team = teamQ.data ?? [];
  const seatLimit = company?.seat_limit ?? 1;

  return (
    <div className="min-h-screen pb-16">
      <header className="safe-top border-b border-border bg-surface/60">
        <div className="hazard-stripe h-1 w-full opacity-70" />
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold uppercase">Admin Console</h1>
            <p className="truncate text-[11px] uppercase tracking-widest text-muted-foreground">
              {company?.name ?? "Your company"} · {planFor(company?.subscription_tier).name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/ledger-conflicts"
              className="inline-flex min-h-[48px] items-center rounded-md border border-border px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:border-primary"
            >
              Sync Conflicts
            </Link>
            <Link
              to="/"
              className="inline-flex min-h-[48px] items-center rounded-md border border-border px-3 text-xs font-semibold uppercase tracking-widest text-primary"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        {isPastDue && (
          <p className="panel border-warning/40 p-3 text-sm text-warning">
            Account past due — records stay readable
            {graceDaysLeft !== null ? ` for ${graceDaysLeft} more day${graceDaysLeft === 1 ? "" : "s"}` : ""}. Update
            payment to resume moves.
          </p>
        )}

        <section className="panel p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Company</h2>
          <form
            className="mt-2 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get("name");
              const name = String(value ?? "").trim();
              if (name && name !== company?.name) renameCompany.mutate(name);
            }}
          >
            <input
              name="name"
              defaultValue={company?.name ?? ""}
              className="min-h-[48px] flex-1 rounded-md border border-border bg-input px-3 text-sm text-foreground"
              placeholder="Company name"
            />
            <button
              type="submit"
              disabled={renameCompany.isPending}
              className="min-h-[48px] rounded-md bg-primary px-4 text-[11px] font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
            >
              {renameCompany.isPending ? "Saving…" : "Save"}
            </button>
          </form>
          {renameCompany.error && (
            <p className="mt-2 text-sm text-destructive">Could not rename the company.</p>
          )}
        </section>

        <section className="panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Crew seats</h2>
            <p className="text-xs text-muted-foreground">
              {team.length} of {seatLimit >= 999999 ? "unlimited" : seatLimit} used
            </p>
          </div>

          {teamQ.isLoading && <p className="mt-3 text-sm text-muted-foreground">Loading crew…</p>}
          {teamQ.error && <p className="mt-3 text-sm text-destructive">Could not load your crew list.</p>}

          <ul className="mt-3 space-y-2">
            {team.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{m.email ?? "Crew member"}</p>
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    Joined {new Date(m.created_at).toLocaleDateString()}
                  </p>
                </div>
                <select
                  value={m.role}
                  disabled={savingId === m.id || m.id === session?.user?.id}
                  onChange={(e) => setRole.mutate({ id: m.id, role: e.target.value })}
                  className="min-h-[48px] rounded-md border border-border bg-input px-3 text-sm text-foreground disabled:opacity-60"
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
            {!teamQ.isLoading && team.length === 0 && (
              <li className="text-sm text-muted-foreground">No crew members on file yet.</li>
            )}
          </ul>
          {setRole.error && <p className="mt-2 text-sm text-destructive">Could not change that role.</p>}
          <p className="mt-3 text-xs text-muted-foreground">
            Crew join by signing up with their work email; you assign their role here. You cannot change your own role.
          </p>
        </section>

        <section className="panel p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Subscription</h2>
          <div className="mt-2 space-y-1 text-sm">
            <p>
              Plan: <span className="font-semibold">{planFor(company?.subscription_tier).name}</span>
            </p>
            <p className="text-muted-foreground">Account status: {company?.subscription_status ?? "unknown"}</p>
            {billingQ.data?.current_period_end && (
              <p className="text-muted-foreground">
                Renews {new Date(billingQ.data.current_period_end).toLocaleDateString()}
              </p>
            )}
            {billingQ.data?.cancel_at_period_end && (
              <p className="text-warning">Cancels at the end of the current period.</p>
            )}
            {!billingQ.isLoading && !billingQ.data && (
              <p className="text-muted-foreground">No subscription record on file.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Gate({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="font-display text-2xl font-bold uppercase">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <Link
        to="/"
        className="mt-4 inline-flex min-h-[48px] items-center text-sm font-semibold uppercase tracking-widest text-primary"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

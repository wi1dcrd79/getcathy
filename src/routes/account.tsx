import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { planFor, UNLIMITED } from "@/lib/plans";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "My Account — C.A.T.H.Y." },
      {
        name: "description",
        content:
          "Your C.A.T.H.Y. account: profile, company, plan, crew seats and sign out — all in one place.",
      },
      { property: "og:title", content: "My Account — C.A.T.H.Y." },
      {
        property: "og:description",
        content: "See your account, company, plan and crew seats, and sign out.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountDashboard,
});

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Company Admin",
  safety_director: "Safety Director",
  qc_inspector: "QC Inspector",
  operator: "Operator",
  field_tech: "Field Tech",
  viewer: "Viewer",
  craftsman: "Craftsman",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function AccountDashboard() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
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
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!authLoading && !session) navigate({ to: "/auth" });
  }, [authLoading, session, navigate]);

  const company = context?.company ?? null;
  const plan = planFor(company?.subscription_tier);

  const seatsQ = useQuery({
    queryKey: ["account-seats", companyId],
    enabled: !!session && !!companyId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const profileQ = useQuery({
    queryKey: ["account-profile-meta", session?.user.id],
    enabled: !!session,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("created_at")
        .eq("id", session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as { created_at: string } | null)?.created_at ?? null;
    },
  });

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  if (authLoading || profileLoading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const email = context?.profile.email ?? session.user.email ?? "—";
  const seatsUsed = seatsQ.data ?? 0;
  const seatLimit = company?.seat_limit ?? plan.seats;
  const seatText =
    seatLimit >= UNLIMITED ? `${seatsUsed} / Unlimited` : `${seatsUsed} / ${seatLimit}`;
  const accountStatus = isPastDue ? "Past Due" : (company?.subscription_status ?? "active");

  return (
    <div className="min-h-screen pb-24">
      <header className="safe-top no-print sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="hazard-stripe h-1 w-full opacity-70" />
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-xl font-bold uppercase leading-none">
              My <span className="text-primary">Account</span>
            </h1>
            <p className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">
              C.A.T.H.Y. — Compliance, Asset Tracking &amp; Heavy Yards
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

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {isPastDue && (
          <div className="rounded-lg border border-warning bg-warning/10 p-4 text-sm text-warning">
            Account Past Due — your records stay safe in read-only mode
            {graceDaysLeft !== null &&
              ` for ${graceDaysLeft} more day${graceDaysLeft === 1 ? "" : "s"}`}
            . Update payment to resume moves and new assets.
          </div>
        )}

        {/* My account */}
        <section className="rounded-lg border border-border bg-surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            My account
          </p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all font-semibold">{email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Role</dt>
              <dd className="font-semibold">
                {isSuperAdmin ? "Super Admin" : (ROLE_LABELS[role] ?? role)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="font-semibold">{fmtDate(profileQ.data ?? null)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">User ID</dt>
              <dd className="font-mono text-xs">{session.user.id}</dd>
            </div>
          </dl>
        </section>

        {/* Company */}
        <section className="rounded-lg border border-border bg-surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Company
          </p>
          {company ? (
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-semibold">{company.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Account status</dt>
                <dd
                  className={`font-semibold uppercase ${
                    accountStatus === "active" ? "text-success" : "text-warning"
                  }`}
                >
                  {accountStatus}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No company on file yet — your workspace is created automatically after your first
              sign-in.
            </p>
          )}
        </section>

        {/* Plan & seats */}
        <section className="rounded-lg border border-border bg-surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Plan &amp; seats
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-display text-2xl font-bold uppercase">{plan.name}</p>
              <p className="text-lg font-bold text-primary">{plan.priceLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Crew seats
              </p>
              <p className="mt-1 font-display text-2xl font-bold">{seatText}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/billing"
              className="touch-target rounded-md border border-border px-4 py-3 text-sm font-semibold uppercase tracking-widest text-foreground hover:border-primary"
            >
              Billing details
            </Link>
            {isPro && (isSuperAdmin || role === "company_admin") && (
              <Link
                to="/company-admin"
                className="touch-target rounded-md border border-primary px-4 py-3 text-sm font-semibold uppercase tracking-widest text-primary hover:bg-primary/10"
              >
                Admin console
              </Link>
            )}
          </div>
        </section>

        {/* Sign out */}
        <section className="rounded-lg border border-border bg-surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Session
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Signing out ends this session on this device. Your records stay safe in the yard.
          </p>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="touch-target mt-3 rounded-md bg-destructive px-5 py-3 text-sm font-bold uppercase tracking-widest text-destructive-foreground disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </section>
      </main>
    </div>
  );
}

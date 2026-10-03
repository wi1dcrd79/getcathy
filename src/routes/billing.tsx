import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { getPaddleEnvironment } from "@/lib/paddle";
import { planFor, UNLIMITED } from "@/lib/plans";
import { UpgradeModal } from "@/components/certvault/UpgradeModal";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [
      { title: "My Plan & Billing — C.A.T.H.Y." },
      {
        name: "description",
        content:
          "View your C.A.T.H.Y. plan, crew seats, billing status and renewal date, and manage your subscription.",
      },
      { property: "og:title", content: "My Plan & Billing — C.A.T.H.Y." },
      {
        property: "og:description",
        content: "See your C.A.T.H.Y. subscription, seat usage and renewal date.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillingDashboard,
});

interface SubscriptionRow {
  status: string;
  product_id: string;
  price_id: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  created_at: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function statusLabel(status: string): { text: string; className: string } {
  switch (status) {
    case "active":
      return { text: "Active", className: "text-success" };
    case "trialing":
      return { text: "Trial", className: "text-success" };
    case "past_due":
      return { text: "Past Due", className: "text-warning" };
    case "canceled":
      return { text: "Canceled", className: "text-destructive" };
    case "paused":
      return { text: "Paused", className: "text-warning" };
    default:
      return { text: status, className: "text-muted-foreground" };
  }
}

function BillingDashboard() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const {
    context,
    companyId,
    isPro,
    isPastDue,
    graceDaysLeft,
    isLoading: profileLoading,
  } = useProfile();
  const [upgradeReason, setUpgradeReason] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !session) navigate({ to: "/auth" });
  }, [authLoading, session, navigate]);

  const company = context?.company ?? null;
  const plan = planFor(company?.subscription_tier);

  const seatsQ = useQuery({
    queryKey: ["billing-seats", companyId],
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

  const subQ = useQuery({
    queryKey: ["my-subscription", session?.user.id],
    enabled: !!session,
    queryFn: async (): Promise<SubscriptionRow | null> => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select(
          "status, product_id, price_id, current_period_start, current_period_end, cancel_at_period_end, created_at",
        )
        .eq("user_id", session!.user.id)
        .eq("environment", getPaddleEnvironment())
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] as unknown as SubscriptionRow) ?? null;
    },
  });

  if (authLoading || profileLoading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const sub = subQ.data ?? null;
  const seatsUsed = seatsQ.data ?? 0;
  const seatLimit = company?.seat_limit ?? plan.seats;
  const seatText =
    seatLimit >= UNLIMITED ? `${seatsUsed} / Unlimited` : `${seatsUsed} / ${seatLimit}`;
  const status = statusLabel(company?.subscription_status ?? sub?.status ?? "active");
  const renews = sub?.cancel_at_period_end
    ? `Access ends ${fmtDate(sub.current_period_end)}`
    : sub?.current_period_end
      ? `Renews ${fmtDate(sub.current_period_end)}`
      : null;

  return (
    <div className="min-h-screen pb-24">
      <header className="safe-top no-print sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="hazard-stripe h-1 w-full opacity-70" />
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-xl font-bold uppercase leading-none">
              My Plan &amp; <span className="text-primary">Billing</span>
            </h1>
            <p className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">
              {company?.name ?? "C.A.T.H.Y. account"}
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

        {/* Current plan */}
        <section className="rounded-lg border border-border bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Current plan
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold uppercase">{plan.name}</h2>
              <p className="mt-1 text-lg font-bold text-primary">{plan.priceLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Status
              </p>
              <p className={`mt-1 text-lg font-bold uppercase ${status.className}`}>
                {status.text}
              </p>
              {renews && <p className="mt-1 text-xs text-muted-foreground">{renews}</p>}
            </div>
          </div>
          <ul className="mt-4 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            {plan.features.map((f) => (
              <li key={f}>• {f}</li>
            ))}
          </ul>
        </section>

        {/* Seats */}
        <section className="rounded-lg border border-border bg-surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Crew seats
          </p>
          <p className="mt-1 font-display text-2xl font-bold">{seatText}</p>
          {seatLimit < UNLIMITED && seatsUsed >= seatLimit && (
            <p className="mt-2 text-sm text-warning">
              Seat limit reached — upgrade to add more crew members.
            </p>
          )}
        </section>

        {/* Billing details */}
        <section className="rounded-lg border border-border bg-surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Billing details
          </p>
          {sub ? (
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Subscription status</dt>
                <dd className={`font-semibold ${statusLabel(sub.status).className}`}>
                  {statusLabel(sub.status).text}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Current period</dt>
                <dd className="font-semibold">
                  {fmtDate(sub.current_period_start)} → {fmtDate(sub.current_period_end)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Auto-renew</dt>
                <dd className="font-semibold">
                  {sub.cancel_at_period_end ? "Off — cancels at period end" : "On"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Plan ID</dt>
                <dd className="font-mono text-xs">{sub.price_id}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {isPro
                ? "Billing record is managed by your company admin."
                : "You're on the Free plan — no billing on file."}
            </p>
          )}
        </section>

        {/* Actions */}
        <section className="flex flex-wrap gap-3">
          {!isPro && (
            <button
              onClick={() =>
                setUpgradeReason("Unlock unlimited assets, crew seats and one-click audit binders.")
              }
              className="touch-target rounded-md bg-accent px-4 py-3 text-sm font-bold uppercase tracking-widest text-accent-foreground"
            >
              Upgrade plan
            </button>
          )}
          {isPro && sub && (
            <a
              href="/terms#billing"
              className="touch-target rounded-md border border-border px-4 py-3 text-sm font-semibold uppercase tracking-widest text-foreground hover:border-primary"
            >
              Cancellation &amp; refund policy
            </a>
          )}
          <a
            href="mailto:wi1dcrd79@gmail.com"
            className="touch-target rounded-md border border-border px-4 py-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground hover:border-primary"
          >
            Contact billing support
          </a>
        </section>
      </main>

      <UpgradeModal
        open={upgradeReason !== null}
        reason={upgradeReason ?? ""}
        onClose={() => setUpgradeReason(null)}
      />
    </div>
  );
}

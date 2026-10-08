import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchPersonnel, fetchCerts } from "@/lib/personnel-data";
import {
  fetchCertificationTypes,
  fetchContinuityLogs,
  summarizeContinuityByTrade,
  type DispatchStatus,
} from "@/lib/compliance-reports-data";
import { formatDate } from "@/lib/compliance";

export const Route = createFileRoute("/continuity")({
  head: () => ({
    meta: [
      { title: "Continuity Dashboard & Retraining Plan | C.A.T.H.Y." },
      {
        name: "description",
        content:
          "Continuity logs by trade, lapsed welder and brazer counts, and a retraining list built from the 150-day continuity clock.",
      },
      { property: "og:title", content: "Continuity Dashboard & Retraining Plan | C.A.T.H.Y." },
      {
        property: "og:description",
        content: "See which welders and brazers have lapsed continuity and plan retraining.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContinuityDashboard,
});

const STATUS_STYLE: Record<DispatchStatus, string> = {
  compliant: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  lapsed: "border-red-500/40 bg-red-500/10 text-red-400",
  expired: "border-red-500/40 bg-red-500/10 text-red-400",
  missing_cert: "border-border bg-muted text-muted-foreground",
  unverified: "border-amber-500/40 bg-amber-500/10 text-amber-400",
};

const STATUS_LABEL: Record<DispatchStatus, string> = {
  compliant: "Compliant",
  warning: "Warning",
  lapsed: "Lapsed",
  expired: "Expired",
  missing_cert: "No cert",
  unverified: "Unverified",
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

function ContinuityDashboard() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const peopleQ = useQuery({ queryKey: ["personnel"], queryFn: fetchPersonnel, enabled: !!session });
  const certsQ = useQuery({ queryKey: ["certs"], queryFn: fetchCerts, enabled: !!session });
  const typesQ = useQuery({
    queryKey: ["certification-types"],
    queryFn: fetchCertificationTypes,
    enabled: !!session,
    retry: 1,
  });
  const logsQ = useQuery({
    queryKey: ["continuity-logs"],
    queryFn: fetchContinuityLogs,
    enabled: !!session,
    retry: 1,
  });

  const gateUnavailable = [typesQ.error, logsQ.error].some((e) => {
    const m = e instanceof Error ? e.message : "";
    return m.includes("does not exist") || m.includes("schema cache") || m.includes("Could not find");
  });

  const trades = useMemo(
    () =>
      summarizeContinuityByTrade(
        peopleQ.data ?? [],
        certsQ.data ?? [],
        typesQ.data ?? [],
        logsQ.data ?? [],
      ),
    [peopleQ.data, certsQ.data, typesQ.data, logsQ.data],
  );

  const totals = trades.reduce(
    (acc, t) => ({
      holders: acc.holders + t.holders.length,
      lapsed: acc.lapsed + t.lapsed,
      warning: acc.warning + t.warning,
      logs30: acc.logs30 + t.logsLast30,
    }),
    { holders: 0, lapsed: 0, warning: 0, logs30: 0 },
  );

  const retraining = trades.flatMap((t) =>
    t.holders
      .filter((h) => h.evaluation.status === "lapsed" || h.evaluation.status === "warning")
      .map((h) => ({ ...h, trade: t.type })),
  );

  const isLoading = peopleQ.isLoading || certsQ.isLoading || typesQ.isLoading || logsQ.isLoading;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Track 6 · Continuity
        </p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Continuity Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verified work logs for each continuity trade. Lapsed means more than 150 days since the
          last verified weld or braze; warning starts after 120 days.{" "}
          <Link to="/compliance-reports" className="text-primary underline">
            Full dispatch report
          </Link>
        </p>
      </header>

      {gateUnavailable && (
        <div
          role="alert"
          className="mb-6 rounded-lg border-2 border-amber-500/60 bg-amber-500/10 px-5 py-4 text-amber-400"
        >
          <p className="text-sm font-bold uppercase tracking-widest">Continuity data not set up yet</p>
          <p className="mt-2 text-sm">
            Continuity logs aren't available on this system yet. This page fills in once the
            dispatch-gate update is applied.
          </p>
        </div>
      )}

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tracked crafts" value={totals.holders} />
        <Stat label="Lapsed" value={totals.lapsed} tone="text-red-400" />
        <Stat label="Warning (120+ days)" value={totals.warning} tone="text-amber-400" />
        <Stat label="Logs, last 30 days" value={totals.logs30} />
      </section>

      {isLoading && <p className="text-sm text-muted-foreground">Loading continuity data…</p>}

      {!isLoading && !gateUnavailable && (
        <>
          <section className="mb-10">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-foreground">
              Retraining plan <span className="ml-2 font-normal text-muted-foreground">({retraining.length})</span>
            </h2>
            {retraining.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody is lapsed or in the warning window.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Craftsperson</th>
                      <th className="px-4 py-3 font-semibold">Trade</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Clock started</th>
                      <th className="px-4 py-3 font-semibold">Days remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retraining.map((h) => (
                      <tr key={`${h.trade.code}-${h.person.id}`} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground">
                            {h.person.first_name} {h.person.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">{h.person.employee_id}</p>
                        </td>
                        <td className="px-4 py-3 text-foreground">{h.trade.name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${STATUS_STYLE[h.evaluation.status]}`}>
                            {STATUS_LABEL[h.evaluation.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground">{formatDate(h.anchorDate)}</td>
                        <td className="px-4 py-3 font-mono text-foreground">{h.evaluation.daysRemaining ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {trades.map((t) => (
            <section key={t.type.code} className="mb-8 rounded-lg border border-border bg-card p-5">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
                  {t.type.name} <span className="ml-2 font-mono font-normal text-muted-foreground">{t.type.code}</span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t.holders.length} holders · <span className="text-red-400">{t.lapsed} lapsed</span> ·{" "}
                  <span className="text-amber-400">{t.warning} warning</span> · {t.compliant} compliant ·{" "}
                  {t.logsLast30} logs (30d) · {t.logsLast90} logs (90d)
                </p>
              </div>
              {t.recentLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No continuity logs recorded for this trade.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {t.recentLogs.map((l) => {
                    const p = peopleQ.data?.find((x) => x.id === l.personnel_id);
                    return (
                      <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <span className="text-foreground">
                          {p ? `${p.first_name} ${p.last_name}` : "Unknown"}
                          {l.work_reference ? <span className="ml-2 text-muted-foreground">{l.work_reference}</span> : null}
                        </span>
                        <span className="text-muted-foreground">
                          {formatDate(l.performed_date)} · {l.verified_by ? "verified" : "unverified"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </>
      )}
    </main>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchPersonnel, fetchCerts } from "@/lib/personnel-data";
import {
  buildDispatchRows,
  fetchCertificationTypes,
  fetchContinuityLogs,
  type DispatchStatus,
  type PersonnelDispatchRow,
} from "@/lib/compliance-reports-data";
import { formatDate } from "@/lib/compliance";

export const Route = createFileRoute("/compliance-reports")({
  head: () => ({
    meta: [
      { title: "Compliance Reports & Dispatch Gate | C.A.T.H.Y." },
      {
        name: "description",
        content:
          "Live dispatch eligibility for every craftsperson: continuity days remaining, last verified work, and hard blocks on lapsed or expired certifications.",
      },
      { property: "og:title", content: "Compliance Reports & Dispatch Gate | C.A.T.H.Y." },
      {
        property: "og:description",
        content:
          "Personnel dispatch status, continuity clocks, and verified work history by trade.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComplianceReports,
});

const STATUS_STYLE: Record<DispatchStatus, string> = {
  compliant: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  lapsed: "border-red-500/40 bg-red-500/10 text-red-400",
  expired: "border-red-500/40 bg-red-500/10 text-red-400",
  missing_cert: "border-border bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<DispatchStatus, string> = {
  compliant: "Compliant",
  warning: "Warning",
  lapsed: "Lapsed",
  expired: "Expired",
  missing_cert: "No Cert",
};

function ComplianceReports() {
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

  const [tradeFilter, setTradeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "blocked" | "dispatchable">("all");

  // Phase A/B tables may not exist yet on a backend that hasn't received
  // those migrations — degrade to cert-only evaluation instead of erroring.
  const gateUnavailable = [typesQ.error, logsQ.error].some((e) => {
    const m = e instanceof Error ? e.message : "";
    return m.includes("does not exist") || m.includes("schema cache") || m.includes("Could not find");
  });
  const gateError = !gateUnavailable && (typesQ.error ?? logsQ.error);

  const rows = useMemo(
    () =>
      buildDispatchRows(
        peopleQ.data ?? [],
        certsQ.data ?? [],
        typesQ.data ?? [],
        logsQ.data ?? [],
      ),
    [peopleQ.data, certsQ.data, typesQ.data, logsQ.data],
  );

  const trades = useMemo(
    () => Array.from(new Set(rows.map((r) => r.person.trade_title))).sort(),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (tradeFilter !== "all" && r.person.trade_title !== tradeFilter) return false;
        if (statusFilter === "blocked" && r.evaluation.isDispatchable) return false;
        if (statusFilter === "dispatchable" && !r.evaluation.isDispatchable) return false;
        return true;
      }),
    [rows, tradeFilter, statusFilter],
  );

  const byTrade = useMemo(() => {
    const map = new Map<string, PersonnelDispatchRow[]>();
    for (const r of filtered) {
      const list = map.get(r.person.trade_title) ?? [];
      list.push(r);
      map.set(r.person.trade_title, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const blocked = rows.filter((r) => !r.evaluation.isDispatchable).length;
  const warnings = rows.filter((r) => r.evaluation.status === "warning").length;

  const isLoading =
    peopleQ.isLoading ||
    certsQ.isLoading ||
    (!gateUnavailable && !gateError && (typesQ.isLoading || logsQ.isLoading));
  const loadError = peopleQ.error ?? certsQ.error ?? gateError;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Track 6 · Compliance Reporting
        </p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Dispatch Gate & Continuity Report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live dispatch eligibility for every craftsperson. Dual-gate trades (welders, medical gas)
          enforce the 150-day continuity clock; single-gate trades enforce calendar expiration.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Personnel</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{rows.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Dispatchable</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{rows.length - blocked}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Warnings</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">{warnings}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Blocked</p>
          <p className="mt-1 text-2xl font-bold text-red-400">{blocked}</p>
        </div>
      </section>

      <section className="mb-6 flex flex-wrap items-center gap-3">
        <select
          value={tradeFilter}
          onChange={(e) => setTradeFilter(e.target.value)}
          className="rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="all">All trades</option>
          {trades.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded-md border border-border">
          {(["all", "dispatchable", "blocked"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-2 text-xs font-semibold uppercase tracking-widest ${
                statusFilter === f
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </section>

      {gateUnavailable && (
        <p className="mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          The dispatch-gate tables (Phase A/B migrations) are not applied to this backend yet, so
          continuity clocks are unavailable. Showing calendar-expiration status only.
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading compliance data…</p>}
      {loadError && (
        <p className="text-sm text-red-400">
          Could not load compliance data: {loadError instanceof Error ? loadError.message : "unknown error"}
        </p>
      )}
      {!isLoading && !loadError && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No personnel on file yet. Add crew members on the Crafts page to see dispatch status here.
        </p>
      )}

      {byTrade.map(([trade, tradeRows]) => (
        <section key={trade} className="mb-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-foreground">
            {trade} <span className="ml-2 font-normal text-muted-foreground">({tradeRows.length})</span>
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Craftsperson</th>
                  <th className="px-4 py-3 font-semibold">Certification</th>
                  <th className="px-4 py-3 font-semibold">Dispatch Status</th>
                  <th className="px-4 py-3 font-semibold">Days Remaining</th>
                  <th className="px-4 py-3 font-semibold">Last Verified Work</th>
                  <th className="px-4 py-3 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {tradeRows.map(({ person, cert, certType, evaluation }) => (
                  <tr key={person.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">
                        {person.first_name} {person.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{person.employee_id}</p>
                    </td>
                    <td className="px-4 py-3">
                      {cert ? (
                        <>
                          <p className="text-foreground">{cert.cert_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {certType?.requires_continuity ? "Dual-gate · 150-day clock" : "Single-gate · calendar"}
                            {cert.expiration_date ? ` · exp ${formatDate(cert.expiration_date)}` : ""}
                          </p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${STATUS_STYLE[evaluation.status]}`}
                      >
                        {STATUS_LABEL[evaluation.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-foreground">
                      {evaluation.daysRemaining ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {evaluation.lastVerifiedWork ? formatDate(evaluation.lastVerifiedWork) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{evaluation.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}

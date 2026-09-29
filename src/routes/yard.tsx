import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { assetStatus, type ComplianceStatus, type InspectionResult } from "@/lib/compliance";

const search = z.object({ site: z.string().optional(), zone: z.string().optional() });

export const Route = createFileRoute("/yard")({
  validateSearch: (s) => search.parse(s),
  head: () => ({
    meta: [
      { title: "Yard Map: Site, Zone, Bin | C.A.T.H.Y." },
      {
        name: "description",
        content: "Drill from site to zone to bin and see compliance status and physical inventory side by side.",
      },
      { property: "og:title", content: "Yard Map: Site, Zone, Bin | C.A.T.H.Y." },
      { property: "og:description", content: "Compliance and inventory together for every site, zone and bin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: YardPage,
});

interface Asset {
  id: string;
  asset_tag: string;
  name: string;
  status: string;
  site: string;
  zone: string;
  bin: string;
  serial_or_vin: string;
}
interface Insp {
  asset_id: string;
  inspection_date: string;
  expiration_date: string;
  result: InspectionResult;
}
interface Move {
  asset_id: string;
  asset_tag: string;
  moved_from: string;
  moved_to: string;
  created_at: string;
}

type Status = ComplianceStatus | "No Inspection";
interface Row extends Asset {
  compliance: Status;
  openActions: number;
}
interface Tally {
  total: number;
  ok: number;
  expiring: number;
  lapsed: number;
  none: number;
  failed: number;
  actions: number;
  flagged: number;
}

function tally(rows: Row[]): Tally {
  const t: Tally = { total: 0, ok: 0, expiring: 0, lapsed: 0, none: 0, failed: 0, actions: 0, flagged: 0 };
  for (const r of rows) {
    t.total++;
    if (r.compliance === "Compliant") t.ok++;
    else if (r.compliance === "Expiring Soon") t.expiring++;
    else if (r.compliance === "Out of Compliance") t.lapsed++;
    else t.none++;
    t.actions += r.openActions;
    if (r.status && !/^(active|in_service|available)$/i.test(r.status)) t.flagged++;
  }
  return t;
}

function YardPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { site, zone } = Route.useSearch();
  const { companyId, isLoading: pl } = useProfile();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const q = useQuery({
    queryKey: ["yard", companyId],
    enabled: !!session && !!companyId,
    queryFn: async () => {
      // RLS (app_internal.get_current_company_id) scopes every read; the explicit
      // company filter is a second layer.
      const [a, i, c, m] = await Promise.all([
        supabase
          .from("assets")
          .select("id, asset_tag, name, status, site, zone, bin, serial_or_vin")
          .eq("company_id", companyId!),
        supabase
          .from("inspections")
          .select("asset_id, inspection_date, expiration_date, result")
          .eq("company_id", companyId!)
          .order("inspection_date", { ascending: false }),
        supabase
          .from("corrective_actions")
          .select("id, asset_id, status, description, due_date, assigned_to, priority")
          .eq("company_id", companyId!)
          .in("status", ["open", "in_progress"]),
        supabase
          .from("location_history")
          .select("asset_id, asset_tag, moved_from, moved_to, created_at")
          .eq("company_id", companyId!)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      for (const r of [a, i, c, m]) if (r.error) throw r.error;
      const latest = new Map<string, Insp>();
      for (const x of (i.data ?? []) as Insp[]) if (!latest.has(x.asset_id)) latest.set(x.asset_id, x);
      const acts = new Map<string, number>();
      for (const x of c.data ?? []) if (x.asset_id) acts.set(x.asset_id, (acts.get(x.asset_id) ?? 0) + 1);
      const rows: Row[] = ((a.data ?? []) as Asset[]).map((x) => {
        const l = latest.get(x.id);
        return {
          ...x,
          compliance: l ? assetStatus(l.expiration_date, l.result) : "No Inspection",
          openActions: acts.get(x.id) ?? 0,
        };
      });
      const mine = (c.data ?? []).filter(
        (x) => x.assigned_to === session!.user.id && x.description.startsWith("Re-inspection required"),
      );
      return { rows, moves: (m.data ?? []) as Move[], mine };
    },
  });

  const level: "site" | "zone" | "bin" = !site ? "site" : !zone ? "zone" : "bin";
  const scoped = useMemo(
    () => (q.data?.rows ?? []).filter((r) => (!site || r.site === site) && (!zone || r.zone === zone)),
    [q.data, site, zone],
  );
  const groups = useMemo(() => {
    const key = level === "site" ? "site" : level === "zone" ? "zone" : "bin";
    const g = new Map<string, Row[]>();
    for (const r of scoped) {
      const k = r[key] || "Unassigned";
      g.set(k, [...(g.get(k) ?? []), r]);
    }
    return [...g.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  }, [scoped, level]);
  const ids = useMemo(() => new Set(scoped.map((r) => r.id)), [scoped]);
  const moves = (q.data?.moves ?? []).filter((m) => ids.has(m.asset_id)).slice(0, 10);
  const all = tally(scoped);

  if (loading || pl) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="min-h-screen pb-16">
      <header className="safe-top border-b border-border bg-surface/60">
        <div className="hazard-stripe h-1 w-full opacity-70" />
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold uppercase">Yard Map</h1>
            <nav className="flex flex-wrap items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground">
              <Link to="/yard" search={{}} className="min-h-[32px] py-1 text-primary">
                All sites
              </Link>
              {site && (
                <>
                  <span>›</span>
                  <Link to="/yard" search={{ site }} className="py-1 text-primary">
                    {site}
                  </Link>
                </>
              )}
              {zone && (
                <>
                  <span>›</span>
                  <span>{zone}</span>
                </>
              )}
            </nav>
          </div>
          <Link
            to="/"
            className="inline-flex min-h-[48px] items-center rounded-md border border-border px-3 text-xs font-semibold uppercase tracking-widest text-primary"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        {q.isLoading && <p className="text-sm text-muted-foreground">Loading yard…</p>}
        {q.error && <p className="text-sm text-destructive">Could not load the yard.</p>}

        {q.data && (
          <>
            {q.data.mine.length > 0 && (
              <section className="panel border-destructive/50 p-4">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-destructive">
                  Re-inspections assigned to you ({q.data.mine.length})
                </h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {q.data.mine.map((x) => (
                    <li key={x.id} className="flex flex-wrap justify-between gap-2">
                      <span>{x.description.replace("Re-inspection required: ", "")}</span>
                      <span className="text-xs text-muted-foreground">Due {new Date(x.due_date).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Equipment" value={all.total} />
              <Stat label="Out of compliance" value={all.lapsed} tone="destructive" />
              <Stat label="Expiring ≤30d" value={all.expiring} tone="warning" />
              <Stat label="Open actions" value={all.actions} tone={all.actions ? "warning" : undefined} />
            </section>

            <section className="panel p-4">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                {level === "site" ? "Sites" : level === "zone" ? `Zones in ${site}` : `Bins in ${zone}`}
              </h2>
              {groups.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No equipment here yet.</p>}
              <ul className="mt-3 space-y-2">
                {groups.map(([name, rows]) => {
                  const t = tally(rows);
                  const inner = (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{name}</p>
                        <p className="text-xs text-muted-foreground">{t.total} items</p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-widest">
                        <Chip tone="success">{t.ok} OK</Chip>
                        {t.expiring > 0 && <Chip tone="warning">{t.expiring} expiring</Chip>}
                        {t.lapsed > 0 && <Chip tone="destructive">{t.lapsed} out</Chip>}
                        {t.none > 0 && <Chip>{t.none} uninspected</Chip>}
                        {t.actions > 0 && <Chip tone="warning">{t.actions} actions</Chip>}
                        {t.flagged > 0 && <Chip tone="destructive">{t.flagged} flagged</Chip>}
                      </div>
                      {level === "bin" && (
                        <ul className="mt-3 divide-y divide-border border-t border-border">
                          {rows.map((r) => (
                            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                              <span className="min-w-0">
                                <span className="font-semibold">{r.asset_tag}</span>{" "}
                                <span className="text-muted-foreground">{r.name}</span>
                              </span>
                              <Chip
                                tone={
                                  r.compliance === "Compliant"
                                    ? "success"
                                    : r.compliance === "Expiring Soon"
                                      ? "warning"
                                      : r.compliance === "Out of Compliance"
                                        ? "destructive"
                                        : undefined
                                }
                              >
                                {r.compliance}
                              </Chip>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  );
                  return (
                    <li key={name}>
                      {level === "bin" ? (
                        <div className="rounded-md border border-border p-3">{inner}</div>
                      ) : (
                        <Link
                          to="/yard"
                          search={level === "site" ? { site: name } : { site: site!, zone: name }}
                          className="block min-h-[48px] rounded-md border border-border p-3 hover:border-primary"
                        >
                          {inner}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="panel p-4">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Recent moves</h2>
              {moves.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No moves recorded.</p>}
              <ul className="mt-3 space-y-1 text-sm">
                {moves.map((m, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2">
                    <span>
                      <span className="font-semibold">{m.asset_tag}</span>{" "}
                      <span className="text-muted-foreground">
                        {m.moved_from} → {m.moved_to}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warning" | "destructive" | undefined }) {
  const c = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="panel p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`font-display text-2xl font-bold ${c}`}>{value}</p>
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "success" | "warning" | "destructive" | undefined }) {
  const c =
    tone === "success"
      ? "border-success/40 text-success"
      : tone === "warning"
        ? "border-warning/40 text-warning"
        : tone === "destructive"
          ? "border-destructive/40 text-destructive"
          : "border-border text-muted-foreground";
  return <span className={`rounded border px-2 py-0.5 ${c}`}>{children}</span>;
}

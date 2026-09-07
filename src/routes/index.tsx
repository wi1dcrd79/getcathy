import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchAssets, fetchWelders, type AssetRecord } from "@/lib/certvault-data";
import {
  CATEGORY_LABEL,
  assetStatus,
  daysUntil,
  formatDate,
  welderStatus,
  type ComplianceStatus,
  type WelderRow,
} from "@/lib/compliance";
import { StatusBadge } from "@/components/certvault/StatusBadge";
import { ScanSheet } from "@/components/certvault/ScanSheet";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CertVault AI — Rigging & Welder Compliance Tracking" },
      {
        name: "description",
        content:
          "Field-first QA/QC dashboard tracking rigging inspections, equipment certifications and welder continuity with OSHA-ready audit binders.",
      },
      { property: "og:title", content: "CertVault AI — Rigging & Welder Compliance Tracking" },
      {
        property: "og:description",
        content:
          "Scan assets in the field, track expirations, and export an OSHA-ready compliance binder.",
      },
    ],
  }),
  component: Dashboard,
});

type Filter = "all" | "rigging" | "welders" | "overdue";

interface UnifiedRow {
  id: string;
  kind: "asset" | "welder";
  tag: string;
  name: string;
  category: string;
  location: string;
  detail: string;
  inspector: string;
  lastDate: string | null;
  expiration: string | null;
  result: string;
  status: ComplianceStatus | "Active" | "Grace Period" | "Lapsed";
  notes: string;
}

function toAssetRow(a: AssetRecord): UnifiedRow {
  const insp = a.inspection;
  return {
    id: a.id,
    kind: "asset",
    tag: a.asset_tag,
    name: a.name,
    category: CATEGORY_LABEL[a.category],
    location: a.location,
    detail: a.assigned_to ?? "Unassigned",
    inspector: insp?.inspector_name ?? "—",
    lastDate: insp?.inspection_date ?? null,
    expiration: insp?.expiration_date ?? null,
    result: insp?.result ?? "—",
    status: insp ? assetStatus(insp.expiration_date, insp.result) : "Out of Compliance",
    notes: insp?.notes ?? "",
  };
}

function toWelderRow(w: WelderRow): UnifiedRow {
  return {
    id: w.id,
    kind: "welder",
    tag: w.welder_id_stamp,
    name: w.welder_name,
    category: "Welder Cert",
    location: w.standard,
    detail: w.process,
    inspector: "Continuity log",
    lastDate: w.continuity_date,
    expiration: w.expiration_date,
    result: w.process,
    status: welderStatus(w.continuity_date),
    notes: `${w.standard} · continuity logged ${formatDate(w.continuity_date)}`,
  };
}

const BAD = new Set(["Out of Compliance", "Lapsed", "Expiring Soon", "Grace Period"]);

function Dashboard() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [sortKey, setSortKey] = useState<"tag" | "name" | "expiration" | "status">("expiration");

  const assetsQ = useQuery({ queryKey: ["assets"], queryFn: fetchAssets });
  const weldersQ = useQuery({ queryKey: ["welders"], queryFn: fetchWelders });

  const rows = useMemo<UnifiedRow[]>(
    () => [
      ...(assetsQ.data ?? []).map(toAssetRow),
      ...(weldersQ.data ?? []).map(toWelderRow),
    ],
    [assetsQ.data, weldersQ.data],
  );

  const metrics = useMemo(() => {
    const compliant = rows.filter((r) => r.status === "Compliant" || r.status === "Active").length;
    const soon = rows.filter((r) => r.status === "Expiring Soon" || r.status === "Grace Period").length;
    const out = rows.filter((r) => r.status === "Out of Compliance" || r.status === "Lapsed").length;
    return { total: rows.length, compliant, soon, out };
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (filter === "rigging") return r.kind === "asset" && r.category === "Rigging";
      if (filter === "welders") return r.kind === "welder";
      if (filter === "overdue") return BAD.has(r.status);
      return true;
    });
    if (q) {
      list = list.filter((r) =>
        [r.tag, r.name, r.location, r.detail, r.category].join(" ").toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (sortKey === "expiration") return (a.expiration ?? "9999").localeCompare(b.expiration ?? "9999");
      if (sortKey === "status") return a.status.localeCompare(b.status);
      return String(a[sortKey]).localeCompare(String(b[sortKey]));
    });
  }, [rows, filter, search, sortKey]);

  const exportCsv = () => {
    const head = ["Tag", "Name", "Category", "Location", "Inspector", "Last", "Expires", "Result", "Status"];
    const body = visible.map((r) =>
      [r.tag, r.name, r.category, r.location, r.inspector, r.lastDate ?? "", r.expiration ?? "", r.result, r.status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `certvault-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loading = assetsQ.isLoading || weldersQ.isLoading;
  const error = assetsQ.error || weldersQ.error;

  return (
    <div className="min-h-screen pb-28 lg:pb-10">
      <header className="no-print sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="hazard-stripe h-1 w-full opacity-70" />
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/images/certvault-icon.png" alt="" width={36} height={36} className="rounded-md" />
            <div>
              <h1 className="text-xl font-bold uppercase leading-none">
                CertVault <span className="text-primary">AI</span>
              </h1>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                QA/QC · Rigging · Welder Continuity
              </p>
            </div>
          </div>
          <div className="hidden gap-2 lg:flex">
            <button
              onClick={exportCsv}
              className="rounded-md border border-border px-3 py-2 text-xs font-semibold uppercase tracking-widest text-foreground hover:border-primary"
            >
              Export CSV
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-md bg-accent px-3 py-2 text-xs font-bold uppercase tracking-widest text-accent-foreground"
            >
              Generate Audit Binder (PDF)
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Total Tracked Assets" value={metrics.total} tone="neutral" />
          <MetricCard label="Active / Compliant" value={metrics.compliant} tone="success" />
          <MetricCard label="Expiring in < 30 Days" value={metrics.soon} tone="warning" />
          <MetricCard label="Out of Compliance" value={metrics.out} tone="danger" />
        </section>

        <div className="no-print mt-5 flex flex-col gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tags, stamps, locations…"
            className="w-full rounded-lg border border-border bg-input px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(
              [
                ["all", "All"],
                ["rigging", "Rigging"],
                ["welders", "Welders"],
                ["overdue", "Overdue / Action Needed"],
              ] as Array<[Filter, string]>
            ).map(([key, text]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-widest ${
                  filter === key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-muted-foreground"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        {loading && rows.length === 0 && <p className="mt-8 text-sm text-muted-foreground">Loading compliance records…</p>}
        {error && (
          <p className="mt-8 text-sm text-destructive">Could not load records. Pull to refresh and try again.</p>
        )}

        {/* Field cards (mobile) */}
        <section className="mt-4 space-y-3 lg:hidden">
          {visible.map((r) => (
            <article key={r.id} className="panel print-plain p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="tag-mono text-sm font-bold text-primary">{r.tag}</p>
                  <p className="text-sm font-semibold">{r.name}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>{r.location}</span>
                <span className="text-right">{r.category}</span>
                <span>{r.detail}</span>
                <span className="text-right">
                  {r.expiration ? `Exp ${formatDate(r.expiration)} · ${daysUntil(r.expiration)}d` : "No record"}
                </span>
              </div>
              {r.notes && <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">{r.notes}</p>}
            </article>
          ))}
          {!loading && visible.length === 0 && (
            <p className="text-sm text-muted-foreground">No records match this filter.</p>
          )}
        </section>

        {/* Manager table (desktop) */}
        <section className="mt-4 hidden overflow-x-auto lg:block">
          <table className="panel print-plain w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                {(
                  [
                    ["tag", "Tag / Stamp"],
                    ["name", "Description"],
                    ["status", "Status"],
                    ["expiration", "Expires"],
                  ] as const
                ).map(([key, text]) => (
                  <th
                    key={key}
                    onClick={() => setSortKey(key)}
                    className="cursor-pointer px-4 py-3 hover:text-primary"
                  >
                    {text} {sortKey === key ? "▾" : ""}
                  </th>
                ))}
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Location / Standard</th>
                <th className="px-4 py-3">Inspector</th>
                <th className="px-4 py-3">Result</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="tag-mono px-4 py-3 font-semibold text-primary">{r.tag}</td>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.expiration ? `${formatDate(r.expiration)} (${daysUntil(r.expiration)}d)` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.category}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.location}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.inspector}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="mt-6 hidden text-xs text-muted-foreground print:block">
          CertVault AI compliance summary generated {new Date().toLocaleString()} — {metrics.total} tracked records,{" "}
          {metrics.out} out of compliance, {metrics.soon} expiring within 30 days.
        </p>
      </main>

      {/* Sticky field action bar */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md items-center justify-between px-6 py-3">
          <button
            onClick={() => setFilter("all")}
            className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
          >
            Assets
          </button>
          <button
            onClick={() => setScanOpen(true)}
            className="-mt-8 flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 border-background bg-accent text-accent-foreground shadow-lg"
          >
            <span className="text-2xl leading-none">▣</span>
            <span className="mt-0.5 text-[9px] font-bold uppercase leading-tight">Quick Scan</span>
          </button>
          <button
            onClick={() => setFilter("overdue")}
            className="text-[11px] font-semibold uppercase tracking-widest text-warning"
          >
            Action
          </button>
        </div>
      </nav>

      <ScanSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onSaved={() => {
          assetsQ.refetch();
          weldersQ.refetch();
        }}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  }[tone];
  return (
    <div className="panel print-plain relative overflow-hidden p-4">
      <div className={`absolute inset-y-0 left-0 w-1 bg-current ${toneClass}`} />
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-4xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

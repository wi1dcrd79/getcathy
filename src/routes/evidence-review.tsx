import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { SIGNED_COLUMNS, type SignableTable } from "@/lib/signatures/signed-fields";
import {
  recordLabel,
  runEvidenceReview,
  type EvidenceFinding,
  type EvidenceResult,
} from "@/lib/evidence-review.functions";

export const Route = createFileRoute("/evidence-review")({
  head: () => ({
    meta: [
      { title: "AI Evidence Review | C.A.T.H.Y." },
      {
        name: "description",
        content: "Upload audit documents and check them against signed compliance records for missing or inconsistent evidence.",
      },
      { property: "og:title", content: "AI Evidence Review | C.A.T.H.Y." },
      { property: "og:description", content: "Cross-check audit paperwork against sealed, signed compliance records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EvidenceReview,
});

const label = "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground";
const field = "w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary";
const btn =
  "min-h-12 rounded-md border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:border-primary disabled:opacity-50";

const MAX_DOCS = 5;
const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
type DocType = (typeof TYPES)[number];

interface Doc {
  name: string;
  mediaType: DocType;
  dataUrl: string;
}
interface SignedOption {
  key: string;
  table: SignableTable;
  id: string;
  label: string;
  signedAt: string;
  assetId?: string | undefined;
  yard?: string | undefined;
}

function YardChip({ s }: { s?: string | undefined }) {
  if (!s) return null;
  const c =
    s === "Active"
      ? "border-success/40 text-success"
      : s === "Expired"
        ? "border-warning/40 text-warning"
        : s === "Out of compliance"
          ? "border-destructive/40 text-destructive"
          : "border-border text-muted-foreground";
  return <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${c}`}>{s}</span>;
}
interface SavedReview {
  id: string;
  title: string;
  overall_status: string;
  summary: string;
  findings: EvidenceFinding[];
  document_names: string[];
  record_refs: Array<{ label: string }>;
  created_at: string;
}

const TARGETS: Array<[SignableTable, "inspection_id" | "cert_verification_id" | "risk_assessment_id"]> = [
  ["inspections", "inspection_id"],
  ["personnel_certs", "cert_verification_id"],
  ["risk_assessments", "risk_assessment_id"],
];

function statusTone(s: string) {
  const v = s.toUpperCase();
  if (v === "CONSISTENT") return "bg-success text-background";
  if (v === "GAPS_FOUND") return "bg-warning text-background";
  return "bg-destructive text-destructive-foreground";
}
function sevTone(s: string) {
  const v = s.toUpperCase();
  if (v === "HIGH") return "border-destructive text-destructive";
  if (v === "MEDIUM") return "border-warning text-warning";
  return "border-border text-muted-foreground";
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error(`Could not read ${file.name}`));
    r.readAsDataURL(file);
  });
}

function EvidenceReview() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { session, loading } = useAuth();
  const { companyId, role, isSuperAdmin, readOnly } = useProfile();
  const canReview = isSuperAdmin || ["company_admin", "safety_director", "qc_inspector"].includes(role);

  const [title, setTitle] = useState("");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<EvidenceResult | null>(null);
  const [detailLevel, setDetailLevel] = useState<"raw" | "summary">("raw");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const signed = useQuery({
    queryKey: ["signed-records", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<SignedOption[]> => {
      const { data: sigs, error } = await supabase
        .from("signatures")
        .select("inspection_id, cert_verification_id, risk_assessment_id, signed_at, synced_at")
        .eq("company_id", companyId!) // explicit tenant filter; RLS also enforces this
        .order("synced_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      const out: SignedOption[] = [];
      for (const [table, col] of TARGETS) {
        const rows = (sigs ?? []).filter((s) => s[col]);
        if (!rows.length) continue;
        const ids = rows.map((s) => s[col] as string);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: recs } = await (supabase.from(table as any) as any)
          .select(SIGNED_COLUMNS[table].join(", "))
          .eq("company_id", companyId!) // explicit tenant filter; RLS also enforces this
          .in("id", ids);
        const byId = new Map(((recs ?? []) as unknown as Record<string, unknown>[]).map((r) => [String(r["id"]), r]));
        for (const s of rows) {
          const rec = byId.get(s[col] as string);
          if (!rec) continue;
          out.push({
            key: `${table}:${s[col]}`,
            table,
            id: s[col] as string,
            label: recordLabel(table, rec),
            signedAt: s.synced_at,
            assetId: table === "inspections" ? (rec["asset_id"] as string) : undefined,
          });
        }
      }
      // Yard Map status for inspected equipment, shown next to each record.
      const assetIds = [...new Set(out.map((o) => o.assetId).filter(Boolean))] as string[];
      if (assetIds.length) {
        const [a, i] = await Promise.all([
          supabase.from("assets").select("id, status").eq("company_id", companyId!).in("id", assetIds),
          supabase
            .from("inspections")
            .select("asset_id, result, expiration_date")
            .eq("company_id", companyId!)
            .in("asset_id", assetIds)
            .order("inspection_date", { ascending: false }),
        ]);
        const latest = new Map<string, { result: string; expiration_date: string }>();
        for (const x of i.data ?? []) if (!latest.has(x.asset_id)) latest.set(x.asset_id, x);
        const status = new Map((a.data ?? []).map((x) => [x.id, x.status]));
        const today = new Date().toISOString().slice(0, 10);
        for (const o of out) {
          if (!o.assetId) continue;
          const s = status.get(o.assetId);
          const l = latest.get(o.assetId);
          if (s === "out_of_compliance") o.yard = l && l.result !== "Fail" && l.expiration_date < today ? "Expired" : "Out of compliance";
          else if (s && /^(active|available|in_service)$/i.test(s)) o.yard = "Active";
          else if (s) o.yard = s.replace(/_/g, " ");
        }
      }
      return out.sort((a, b) => b.signedAt.localeCompare(a.signedAt));
    },
  });

  const history = useQuery({
    queryKey: ["evidence-reviews", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<SavedReview[]> => {
      const { data, error } = await supabase
        .from("evidence_reviews")
        .select("id, title, overall_status, summary, findings, document_names, record_refs, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SavedReview[];
    },
  });

  async function onPick(files: FileList | null) {
    if (!files) return;
    setErr(null);
    const next = [...docs];
    for (const f of Array.from(files)) {
      if (next.length >= MAX_DOCS) {
        setErr(`Up to ${MAX_DOCS} documents per review.`);
        break;
      }
      if (!(TYPES as readonly string[]).includes(f.type)) {
        setErr(`${f.name}: only PDF, JPG, PNG or WEBP files are supported.`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setErr(`${f.name} is larger than 8 MB.`);
        continue;
      }
      next.push({ name: f.name, mediaType: f.type as DocType, dataUrl: await readFile(f) });
    }
    setDocs(next);
    if (fileRef.current) fileRef.current.value = "";
  }

  function toggle(key: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(key)) n.delete(key);
      else if (n.size < 25) n.add(key);
      return n;
    });
  }

  async function run() {
    setErr(null);
    setResult(null);
    const options = signed.data ?? [];
    const records = options.filter((o) => picked.has(o.key)).map((o) => ({ table: o.table, id: o.id }));
    if (title.trim().length < 3) return setErr("Give the audit a short title.");
    if (!docs.length) return setErr("Upload at least one audit document.");
    if (!records.length) return setErr("Select at least one signed record to compare against.");
    setBusy(true);
    try {
      const res = await runEvidenceReview({ data: { title: title.trim(), documents: docs, records, detailLevel } });
      setResult(res);
      if (res.saveError) setErr(`Review finished but could not be saved: ${res.saveError}`);
      qc.invalidateQueries({ queryKey: ["evidence-reviews", companyId] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Evidence review failed.");
    } finally {
      setBusy(false);
    }
  }

  const options = (signed.data ?? []).filter((o) => o.label.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link to="/" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-bold uppercase tracking-wide">AI Evidence Review</h1>
          <p className="text-sm text-muted-foreground">
            Upload audit paperwork and check it against your signed records for missing or inconsistent evidence.
          </p>
        </div>
      </div>

      {!canReview ? (
        <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
          Only company admins, safety directors and QC inspectors can run evidence reviews. You can still read past
          reviews below.
        </div>
      ) : (
        <section className="space-y-5 rounded-md border border-border bg-card p-4">
          <div>
            <label className={label} htmlFor="ev-title">Audit title</label>
            <input
              id="ev-title"
              className={field}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q3 third-party rigging audit"
            />
          </div>

          <div>
            <span className={label}>Audit documents (PDF or photos, up to {MAX_DOCS})</span>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => onPick(e.target.files)}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
                Add documents
              </button>
              {docs.map((d, i) => (
                <span key={i} className="flex min-h-12 items-center gap-2 rounded-md border border-border px-3 text-xs">
                  {d.mediaType === "application/pdf" ? "PDF" : "IMG"} · {d.name}
                  <button
                    type="button"
                    aria-label={`Remove ${d.name}`}
                    className="px-2 text-muted-foreground hover:text-destructive"
                    onClick={() => setDocs(docs.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <span className={label}>Signed records this audit covers ({picked.size} selected)</span>
            <input className={`${field} mb-2`} placeholder="Filter records" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div className="max-h-72 overflow-y-auto rounded-md border border-border">
              {signed.isLoading && <p className="p-3 text-sm text-muted-foreground">Loading signed records…</p>}
              {signed.data && options.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">No signed records yet. Sign off inspections, certifications or risk reviews first.</p>
              )}
              {options.map((o) => (
                <label key={o.key} className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border px-3 text-sm last:border-b-0 hover:bg-muted">
                  <input type="checkbox" className="h-5 w-5" checked={picked.has(o.key)} onChange={() => toggle(o.key)} />
                  <span className="flex-1">{o.label}</span>
                  <YardChip s={o.yard} />
                  <span className="text-xs text-muted-foreground">{new Date(o.signedAt).toLocaleDateString()}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <span className={label}>What the AI may see</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`${btn} ${detailLevel === "raw" ? "border-primary text-primary" : ""}`}
                onClick={() => setDetailLevel("raw")}
              >
                Full record content
              </button>
              <button
                type="button"
                className={`${btn} ${detailLevel === "summary" ? "border-primary text-primary" : ""}`}
                onClick={() => setDetailLevel("summary")}
              >
                Summary only
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {detailLevel === "raw"
                ? "Full signed field values (names, notes, findings) are sent to the AI for the most accurate comparison."
                : "Only labels, dates, cert numbers and fingerprints leave the database — names and free-text findings stay inside. Mismatch detection is weaker."}
            </p>
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}
          <button
            type="button"
            className="min-h-12 w-full rounded-md bg-primary px-4 text-sm font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
            disabled={busy || readOnly}
            onClick={run}
          >
            {busy ? "Comparing documents with records…" : readOnly ? "Read-only (billing past due)" : "Run evidence review"}
          </button>
        </section>
      )}

      {result && <ResultView title={title} r={result} />}

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Review history</h2>
        {history.data?.length === 0 && <p className="text-sm text-muted-foreground">No reviews yet.</p>}
        {history.data?.map((h) => (
          <details key={h.id} className="rounded-md border border-border bg-card p-3">
            <summary className="flex min-h-12 cursor-pointer items-center gap-3">
              <span className={`rounded px-2 py-1 text-[10px] font-bold ${statusTone(h.overall_status)}`}>{h.overall_status.replace("_", " ")}</span>
              <span className="flex-1 text-sm font-semibold">{h.title}</span>
              <span className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              Documents: {h.document_names.join(", ")} · Records: {h.record_refs.map((r) => r.label).join("; ")}
            </p>
            <ResultView r={h} compact />
          </details>
        ))}
      </section>
    </div>
  );
}

function ResultView({ r, title, compact }: { r: EvidenceResult; title?: string; compact?: boolean }) {
  return (
    <section className={compact ? "mt-3 space-y-3" : "space-y-3 rounded-md border border-border bg-card p-4"}>
      {!compact && (
        <div className="flex items-center gap-3">
          <span className={`rounded px-2 py-1 text-xs font-bold ${statusTone(r.overall_status)}`}>{r.overall_status.replace("_", " ")}</span>
          <h2 className="text-lg font-bold">{title}</h2>
        </div>
      )}
      <p className="text-sm">{r.summary}</p>
      {r.findings.length === 0 ? (
        <p className="text-sm text-success">No missing or inconsistent evidence found.</p>
      ) : (
        <ul className="space-y-2">
          {r.findings.map((f, i) => (
            <li key={i} className={`rounded-md border-l-4 bg-background p-3 ${sevTone(f.severity)}`}>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-widest">
                <span>{f.severity}</span>
                <span className="text-muted-foreground">{f.kind.replaceAll("_", " ")}</span>
              </div>
              <p className="mt-1 text-sm text-foreground">{f.detail}</p>
              <p className="mt-1 text-xs text-muted-foreground">Record: {f.record} · Document: {f.document}</p>
              <p className="mt-1 text-xs text-foreground">→ {f.recommendation}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        AI findings are advisory. Signed records are sealed — corrections require a new record or version.
      </p>
    </section>
  );
}

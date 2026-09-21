import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { analyzeRisk, type RiskAction, type RiskResult } from "@/lib/risk-analysis.functions";

export const Route = createFileRoute("/risk-analysis")({
  head: () => ({
    meta: [
      { title: "AI Risk Review | C.A.T.H.Y." },
      {
        name: "description",
        content:
          "Safety managers submit inspection notes and asset photos and get a prioritized risk summary with ranked corrective actions.",
      },
      { property: "og:title", content: "AI Risk Review | C.A.T.H.Y." },
      {
        property: "og:description",
        content: "Turn field inspection notes and photos into a ranked hazard summary and corrective action plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RiskAnalysis,
});

const label = "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground";
const field =
  "w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary";
const btn =
  "rounded-md border border-border px-3 py-2 text-xs font-semibold uppercase tracking-widest hover:border-primary";

const MAX_PHOTOS = 6;
const MAX_BYTES = 6 * 1024 * 1024;

interface Photo {
  name: string;
  dataUrl: string;
}

interface SavedRow {
  id: string;
  asset_tag: string | null;
  overall_risk: string;
  summary: string;
  actions: RiskAction[];
  photo_count: number;
  created_at: string;
}

function riskTone(level: string) {
  switch (level.toUpperCase()) {
    case "CRITICAL":
      return "bg-destructive text-destructive-foreground";
    case "HIGH":
      return "bg-warning text-background";
    case "MODERATE":
      return "bg-accent text-accent-foreground";
    default:
      return "bg-success text-background";
  }
}

function priorityTone(p: string) {
  switch (p.toUpperCase()) {
    case "P1":
      return "border-destructive text-destructive";
    case "P2":
      return "border-warning text-warning";
    default:
      return "border-border text-muted-foreground";
  }
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function RiskAnalysis() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, loading } = useAuth();
  const { companyId, canWriteCompliance, readOnly } = useProfile();

  const [assetTag, setAssetTag] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<RiskResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const history = useQuery({
    queryKey: ["risk-assessments", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<SavedRow[]> => {
      const { data, error } = await supabase
        .from("risk_assessments")
        .select("id, asset_tag, overall_risk, summary, actions, photo_count, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SavedRow[];
    },
  });

  async function onPickPhotos(files: FileList | null) {
    if (!files?.length) return;
    setErr(null);
    const next: Photo[] = [];
    for (const file of Array.from(files)) {
      if (photos.length + next.length >= MAX_PHOTOS) break;
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_BYTES) {
        setErr(`${file.name} is larger than 6 MB and was skipped.`);
        continue;
      }
      next.push({ name: file.name, dataUrl: await readFile(file) });
    }
    setPhotos((prev) => [...prev, ...next].slice(0, MAX_PHOTOS));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function run() {
    setErr(null);
    if (notes.trim().length < 10) {
      setErr("Add a few more details to the inspection notes before running the review.");
      return;
    }
    setBusy(true);
    try {
      const data = await analyzeRisk({
        data: {
          notes: notes.trim(),
          assetTag: assetTag.trim() || null,
          photos: photos.map((p) => ({ dataUrl: p.dataUrl })),
        },
      });
      setResult({ overall_risk: data.overall_risk, summary: data.summary, actions: data.actions });
      if (data.saveError) setErr(`Review complete, but it was not saved to the log: ${data.saveError}`);
      queryClient.invalidateQueries({ queryKey: ["risk-assessments", companyId] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The risk review could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setAssetTag("");
    setNotes("");
    setPhotos([]);
    setResult(null);
    setErr(null);
  }

  const locked = !canWriteCompliance || readOnly;

  return (
    <div className="min-h-screen pb-16">
      <header className="safe-top no-print sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="hazard-stripe h-1 w-full opacity-70" />
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold uppercase leading-none">AI Risk Review</h1>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Notes + photos &rarr; ranked hazards
            </p>
          </div>
          <Link to="/" className={btn}>
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-5">
        {locked && (
          <p className="panel p-3 text-sm text-warning">
            {readOnly
              ? "Your account is past due, so new reviews are paused. Past reviews below stay readable."
              : "Only compliance roles (company admin, safety director, QC inspector) can run a risk review."}
          </p>
        )}

        <section className="panel space-y-3 p-4">
          <h2 className="text-sm font-bold uppercase tracking-widest">New review</h2>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="sm:col-span-1">
              <span className={label}>Asset tag (optional)</span>
              <input
                className={field}
                value={assetTag}
                onChange={(e) => setAssetTag(e.target.value)}
                placeholder="CR-2291"
                disabled={locked || busy}
              />
            </label>
          </div>

          <label className="block">
            <span className={label}>Inspection notes</span>
            <textarea
              className={`${field} min-h-[140px] resize-y`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What you saw in the field: wear, deformation, corrosion, missing tags, load history, environment…"
              disabled={locked || busy}
            />
          </label>

          <div>
            <span className={label}>Asset photos (up to {MAX_PHOTOS})</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => onPickPhotos(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={locked || busy || photos.length >= MAX_PHOTOS}
              className="min-h-[48px] rounded-md border border-border px-4 text-xs font-bold uppercase tracking-widest hover:border-primary disabled:opacity-40"
            >
              Add photos
            </button>
            {photos.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {photos.map((p, i) => (
                  <div key={`${p.name}-${i}`} className="relative">
                    <img
                      src={p.dataUrl}
                      alt={p.name}
                      className="h-20 w-full rounded-md border border-border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute right-1 top-1 h-8 w-8 rounded-md bg-background/90 text-xs font-bold"
                      aria-label={`Remove ${p.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={run}
              disabled={locked || busy}
              className="min-h-[48px] rounded-md bg-primary px-5 text-xs font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
            >
              {busy ? "Reviewing…" : "Run risk review"}
            </button>
            <button type="button" onClick={reset} disabled={busy} className={`${btn} min-h-[48px]`}>
              Clear
            </button>
          </div>
          {busy && (
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Reading the notes and photos — this can take up to a minute.
            </p>
          )}
        </section>

        {result && (
          <section className="panel space-y-4 p-4">
            <div className="flex items-center gap-3">
              <span
                className={`rounded-md px-3 py-1 text-xs font-bold uppercase tracking-widest ${riskTone(result.overall_risk)}`}
              >
                {result.overall_risk}
              </span>
              <h2 className="text-sm font-bold uppercase tracking-widest">Risk summary</h2>
            </div>
            <p className="text-sm leading-relaxed">{result.summary}</p>

            <h3 className="text-sm font-bold uppercase tracking-widest">Corrective actions</h3>
            <ol className="space-y-3">
              {result.actions.map((a, i) => (
                <li key={i} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded border px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest ${priorityTone(a.priority)}`}
                    >
                      {a.priority}
                    </span>
                    <span className="text-sm font-semibold">{a.title}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{a.rationale}</p>
                  <p className="mt-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                    {a.responsible_role} · {a.due_window}
                  </p>
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-muted-foreground">
              AI-assisted guidance. A qualified inspector must verify before any equipment decision.
            </p>
          </section>
        )}

        <section className="panel space-y-3 p-4">
          <h2 className="text-sm font-bold uppercase tracking-widest">Review log</h2>
          {history.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!history.isLoading && (history.data?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No risk reviews recorded yet.</p>
          )}
          <ul className="space-y-2">
            {(history.data ?? []).map((row) => (
              <li key={row.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest ${riskTone(row.overall_risk)}`}
                  >
                    {row.overall_risk}
                  </span>
                  <span className="text-sm font-semibold">{row.asset_tag || "Unassigned asset"}</span>
                  <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()} · {row.photo_count} photo
                    {row.photo_count === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{row.summary}</p>
                <p className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">
                  {(row.actions ?? []).length} corrective action
                  {(row.actions ?? []).length === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

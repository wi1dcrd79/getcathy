import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import Papa from "papaparse";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { buildBreadcrumb } from "@/lib/compliance";
import { UpgradeModal } from "@/components/certvault/UpgradeModal";
import { PlanLimitError } from "@/lib/certvault-data";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "CSV Bulk Onboarding | C.A.T.H.Y." },
      {
        name: "description",
        content:
          "Upload equipment and personnel spreadsheets, map your columns with a live preview, and load them straight into C.A.T.H.Y..",
      },
      { property: "og:title", content: "CSV Bulk Onboarding | C.A.T.H.Y." },
      {
        property: "og:description",
        content: "Map spreadsheet columns to assets and crew records with a preview before importing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

const label = "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground";
const field =
  "w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary";

type Mode = "assets" | "personnel";

const TARGETS: Record<Mode, Array<{ key: string; text: string; required?: boolean }>> = {
  assets: [
    { key: "asset_tag", text: "Asset tag", required: true },
    { key: "name", text: "Description", required: true },
    { key: "category", text: "Category (rigging / welder_cert / heavy_equipment / ppe)" },
    { key: "make_model", text: "Make & model" },
    { key: "serial_or_vin", text: "Serial / VIN" },
    { key: "site", text: "Site" },
    { key: "zone", text: "Zone" },
    { key: "bin", text: "Bin" },
  ],
  personnel: [
    { key: "first_name", text: "First name", required: true },
    { key: "last_name", text: "Last name", required: true },
    { key: "employee_id", text: "Employee ID", required: true },
    { key: "trade_title", text: "Craft title", required: true },
  ],
};

const CATEGORIES = new Set(["rigging", "welder_cert", "heavy_equipment", "ppe"]);

function guess(headers: string[], key: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const target = norm(key);
  return (
    headers.find((h) => norm(h) === target) ??
    headers.find((h) => norm(h).includes(target) || target.includes(norm(h))) ??
    ""
  );
}

function ImportPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const { companyId } = useProfile();
  const [mode, setMode] = useState<Mode>("assets");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  const onFile = (file: File) => {
    setErr(null);
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (out) => {
        const hs = (out.meta.fields ?? []).filter(Boolean);
        setHeaders(hs);
        setRows(out.data);
        const initial: Record<string, string> = {};
        for (const t of TARGETS[mode]) initial[t.key] = guess(hs, t.key);
        setMap(initial);
      },
      error: () => setErr("That file could not be read. Please export it again as CSV."),
    });
  };

  const value = (row: Record<string, string>, key: string) => (map[key] ? (row[map[key]!] ?? "").trim() : "");

  const runImport = async () => {
    if (!companyId) {
      setErr("No company found for this account.");
      return;
    }
    setBusy(true);
    setErr(null);
    let ok = 0;
    let skipped = 0;
    try {
      for (const row of rows) {
        if (mode === "assets") {
          const tag = value(row, "asset_tag");
          const name = value(row, "name");
          if (!tag || !name) {
            skipped += 1;
            continue;
          }
          const site = value(row, "site");
          const zone = value(row, "zone");
          const bin = value(row, "bin");
          const crumb = buildBreadcrumb(site, zone, bin);
          const catRaw = value(row, "category").toLowerCase().replace(/\s+/g, "_");
          const { error } = await supabase.from("assets").insert({
            asset_tag: tag,
            name,
            category: CATEGORIES.has(catRaw) ? catRaw : "rigging",
            make_model: value(row, "make_model"),
            serial_or_vin: value(row, "serial_or_vin"),
            site,
            zone,
            bin,
            location: crumb,
            current_location: crumb,
            company_id: companyId,
          } as never);
          if (error) {
            if (error.message.includes("FREE_PLAN_LIMIT")) throw new PlanLimitError();
            skipped += 1;
          } else ok += 1;
        } else {
          const first = value(row, "first_name");
          const last = value(row, "last_name");
          const emp = value(row, "employee_id");
          if (!first || !last || !emp) {
            skipped += 1;
            continue;
          }
          const { error } = await supabase.from("personnel_records").insert({
            first_name: first,
            last_name: last,
            employee_id: emp,
            trade_title: value(row, "trade_title") || "General Labor",
            company_id: companyId,
            status: "active",
          } as never);
          if (error) skipped += 1;
          else ok += 1;
        }
      }
      setResult(`Imported ${ok} record${ok === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}.`);
    } catch (e) {
      if (e instanceof PlanLimitError) setUpgrade(true);
      else setErr(e instanceof Error ? e.message : "The import stopped early.");
      setResult(`Imported ${ok} record${ok === 1 ? "" : "s"} before stopping.`);
    } finally {
      setBusy(false);
    }
  };

  const preview = rows.slice(0, 5);

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="hazard-stripe h-1 w-full opacity-70" />
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold uppercase leading-none">Bulk Onboarding</h1>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              CSV import · field mapping
            </p>
          </div>
          <Link
            to="/"
            className="rounded-md border border-border px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:border-primary"
          >
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-5">
        <div className="flex gap-2">
          {(
            [
              ["assets", "Equipment"],
              ["personnel", "Crew"],
            ] as Array<[Mode, string]>
          ).map(([key, text]) => (
            <button
              key={key}
              onClick={() => {
                setMode(key);
                setHeaders([]);
                setRows([]);
                setMap({});
                setResult(null);
              }}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-widest ${
                mode === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground"
              }`}
            >
              {text}
            </button>
          ))}
        </div>

        <section className="panel p-4">
          <span className={label}>Upload spreadsheet (.csv)</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-input file:px-3 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-widest file:text-foreground"
          />
          {rows.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {rows.length} rows found · {headers.length} columns
            </p>
          )}
        </section>

        {headers.length > 0 && (
          <>
            <section className="panel p-4">
              <h2 className="text-sm font-bold uppercase tracking-widest">Map your columns</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {TARGETS[mode].map((t) => (
                  <div key={t.key}>
                    <span className={label}>
                      {t.text}
                      {t.required ? " *" : ""}
                    </span>
                    <select
                      className={field}
                      value={map[t.key] ?? ""}
                      onChange={(e) => setMap({ ...map, [t.key]: e.target.value })}
                    >
                      <option value="">— not mapped —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel overflow-x-auto p-0">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                    {TARGETS[mode].map((t) => (
                      <th key={t.key} className="px-3 py-2">
                        {t.text}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      {TARGETS[mode].map((t) => (
                        <td key={t.key} className="px-3 py-2 text-muted-foreground">
                          {value(row, t.key) || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <button
              onClick={runImport}
              disabled={busy}
              className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-40"
            >
              {busy ? "Importing…" : `Import ${rows.length} rows`}
            </button>
          </>
        )}

        {err && <p className="text-sm text-destructive">{err}</p>}
        {result && <p className="text-sm text-success">{result}</p>}
      </main>

      <UpgradeModal
        open={upgrade}
        reason="Free accounts track up to 3 assets. Upgrade to bulk-load your whole yard."
        onClose={() => setUpgrade(false)}
      />
    </div>
  );
}

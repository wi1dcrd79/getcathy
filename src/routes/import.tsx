import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { buildBreadcrumb } from "@/lib/compliance";
import { UpgradeModal } from "@/components/certvault/UpgradeModal";
import { PlanLimitError } from "@/lib/certvault-data";
import { clean, matchCraft, parseDate, sanitizeRows } from "@/lib/import-sanitize";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "CSV Bulk Onboarding | C.A.T.H.Y." },
      {
        name: "description",
        content:
          "Upload equipment and personnel spreadsheets, map your columns, review a validated preview with duplicate flags, then load them into C.A.T.H.Y.",
      },
      { property: "og:title", content: "CSV Bulk Onboarding | C.A.T.H.Y." },
      {
        property: "og:description",
        content: "Sanitised spreadsheet import with date normalisation, craft matching and duplicate detection.",
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
    { key: "cert_name", text: "Certification (optional)" },
    { key: "issue_date", text: "Issue date (optional)" },
    { key: "expiration_date", text: "Expiration date (optional)" },
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

interface Checked {
  row: Record<string, string>;
  values: Record<string, string>;
  issues: string[];
  duplicate: boolean;
  skip: boolean;
  note: string[];
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
  const [existingTags, setExistingTags] = useState<Set<string>>(new Set());
  const [existingEmployees, setExistingEmployees] = useState<Set<string>>(new Set());
  const [dropped, setDropped] = useState(0);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    (async () => {
      const [a, p] = await Promise.all([
        supabase.from("assets").select("asset_tag,serial_or_vin"),
        supabase.from("personnel_records").select("employee_id"),
      ]);
      if (!alive) return;
      const tags = new Set<string>();
      for (const r of a.data ?? []) {
        if (r.asset_tag) tags.add(r.asset_tag.trim().toLowerCase());
        if (r.serial_or_vin) tags.add(r.serial_or_vin.trim().toLowerCase());
      }
      setExistingTags(tags);
      setExistingEmployees(
        new Set((p.data ?? []).map((r) => (r.employee_id ?? "").trim().toLowerCase()).filter(Boolean)),
      );
    })();
    return () => {
      alive = false;
    };
  }, [session, result]);

  const onFile = (file: File) => {
    setErr(null);
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => clean(h),
      complete: (out) => {
        const cleaned = sanitizeRows(out.data as Record<string, unknown>[]);
        setDropped(out.data.length - cleaned.length);
        const hs = (out.meta.fields ?? []).map((h) => clean(h)).filter(Boolean);
        setHeaders(hs);
        setRows(cleaned);
        const initial: Record<string, string> = {};
        for (const t of TARGETS[mode]) initial[t.key] = guess(hs, t.key);
        setMap(initial);
      },
      error: () => setErr("That file could not be read. Please export it again as CSV."),
    });
  };

  const raw = (row: Record<string, string>, key: string) => (map[key] ? clean(row[map[key]!]) : "");

  /** Sanitise + validate every row before anything touches the database. */
  const checked: Checked[] = useMemo(() => {
    const seen = new Set<string>();
    return rows.map((row) => {
      const values: Record<string, string> = {};
      const issues: string[] = [];
      const note: string[] = [];
      let duplicate = false;

      for (const t of TARGETS[mode]) values[t.key] = raw(row, t.key);

      if (mode === "assets") {
        if (!values['asset_tag']) issues.push("Missing asset tag");
        if (!values['name']) issues.push("Missing description");
        const key = values['asset_tag']!.toLowerCase();
        const serial = (values['serial_or_vin'] ?? "").toLowerCase();
        if (key && (existingTags.has(key) || (serial && existingTags.has(serial)))) {
          duplicate = true;
          issues.push("Already in your yard");
        }
        if (key && seen.has(key)) {
          duplicate = true;
          issues.push("Duplicated in this file");
        }
        if (key) seen.add(key);
        const cat = (values['category'] ?? "").toLowerCase().replace(/\s+/g, "_");
        values['category'] = CATEGORIES.has(cat) ? cat : "rigging";
        if (cat && !CATEGORIES.has(cat)) note.push(`Category → rigging`);
      } else {
        if (!values['first_name']) issues.push("Missing first name");
        if (!values['last_name']) issues.push("Missing last name");
        if (!values['employee_id']) issues.push("Missing employee ID");
        const emp = values['employee_id']!.toLowerCase();
        if (emp && existingEmployees.has(emp)) {
          duplicate = true;
          issues.push("Employee already on the roster");
        }
        if (emp && seen.has(emp)) {
          duplicate = true;
          issues.push("Duplicated in this file");
        }
        if (emp) seen.add(emp);

        const craft = matchCraft(values['trade_title'] ?? "");
        if (craft.craft !== values['trade_title']) note.push(`Craft → ${craft.craft}`);
        if (!craft.matched && values['trade_title']) note.push("Kept as custom trade");
        values['trade_title'] = craft.craft;

        for (const dk of ["issue_date", "expiration_date"] as const) {
          const rawDate = values[dk];
          if (!rawDate) continue;
          const parsed = parseDate(rawDate);
          if (parsed) {
            if (parsed !== rawDate) note.push(`${dk === "issue_date" ? "Issued" : "Expires"} → ${parsed}`);
            values[dk] = parsed;
          } else {
            issues.push(`Unreadable ${dk.replace("_", " ")}: "${rawDate}"`);
            values[dk] = "";
          }
        }
      }

      const skip = issues.length > 0;
      return { row, values, issues, duplicate, skip, note };
    });
  }, [rows, map, mode, existingTags, existingEmployees]);

  const good = checked.filter((c) => !c.skip);
  const bad = checked.length - good.length;
  const dupes = checked.filter((c) => c.duplicate).length;

  const runImport = async () => {
    if (!companyId) {
      setErr("No company found for this account.");
      return;
    }
    setBusy(true);
    setErr(null);
    let ok = 0;
    try {
      for (const c of good) {
        const v = c.values;
        if (mode === "assets") {
          const crumb = buildBreadcrumb(v['site'] ?? "", v['zone'] ?? "", v['bin'] ?? "");
          const { error } = await supabase.from("assets").insert({
            asset_tag: v['asset_tag']!,
            name: v['name']!,
            category: v['category']!,
            make_model: v['make_model'] ?? "",
            serial_or_vin: v['serial_or_vin'] ?? "",
            site: v['site'] ?? "",
            zone: v['zone'] ?? "",
            bin: v['bin'] ?? "",
            location: crumb,
            current_location: crumb,
            company_id: companyId,
          } as never);
          if (error) {
            if (error.message.includes("FREE_PLAN_LIMIT")) throw new PlanLimitError();
            throw new Error(error.message);
          }
          ok += 1;
        } else {
          const { data, error } = await supabase
            .from("personnel_records")
            .insert({
              first_name: v['first_name']!,
              last_name: v['last_name']!,
              employee_id: v['employee_id']!,
              trade_title: v['trade_title'] || "General Labor",
              company_id: companyId,
              status: "active",
            } as never)
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          ok += 1;
          if (v['cert_name'] && data?.id) {
            await supabase.from("personnel_certs").insert({
              personnel_id: data.id,
              company_id: companyId,
              cert_name: v['cert_name'],
              issue_date: v['issue_date'] || new Date().toISOString().slice(0, 10),
              expiration_date: v['expiration_date'] || null,
            } as never);
          }
        }
      }
      setResult(
        `Imported ${ok} record${ok === 1 ? "" : "s"}${bad ? `, held back ${bad} flagged row${bad === 1 ? "" : "s"}` : ""}.`,
      );
    } catch (e) {
      if (e instanceof PlanLimitError) setUpgrade(true);
      else setErr(e instanceof Error ? e.message : "The import stopped early.");
      setResult(`Imported ${ok} record${ok === 1 ? "" : "s"} before stopping.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="hazard-stripe h-1 w-full opacity-70" />
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold uppercase leading-none">Bulk Onboarding</h1>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              CSV import · sanitised preview
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

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-5">
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
                setDropped(0);
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
              {rows.length} usable rows · {headers.length} columns
              {dropped > 0 ? ` · ${dropped} blank row${dropped === 1 ? "" : "s"} ignored` : ""}
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

            <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-widest">
              <span className="rounded-full border border-success px-3 py-1 text-success">
                {good.length} ready
              </span>
              {dupes > 0 && (
                <span className="rounded-full border border-warning px-3 py-1 text-warning">
                  {dupes} duplicate{dupes === 1 ? "" : "s"}
                </span>
              )}
              {bad > 0 && (
                <span className="rounded-full border border-destructive px-3 py-1 text-destructive">
                  {bad} held back
                </span>
              )}
            </div>

            <section className="panel max-h-[28rem] overflow-auto p-0">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                    <th className="px-3 py-2">Status</th>
                    {TARGETS[mode].map((t) => (
                      <th key={t.key} className="px-3 py-2">
                        {t.text}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {checked.map((c, i) => (
                    <tr
                      key={i}
                      className={`border-b border-border/60 last:border-0 ${
                        c.skip ? "bg-destructive/10" : c.note.length ? "bg-warning/5" : ""
                      }`}
                    >
                      <td className="px-3 py-2 align-top text-xs">
                        {c.skip ? (
                          <span className="font-bold text-destructive">{c.issues.join(" · ")}</span>
                        ) : c.note.length ? (
                          <span className="text-warning">{c.note.join(" · ")}</span>
                        ) : (
                          <span className="text-success">Ready</span>
                        )}
                      </td>
                      {TARGETS[mode].map((t) => (
                        <td key={t.key} className="px-3 py-2 align-top text-muted-foreground">
                          {c.values[t.key] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <button
              onClick={runImport}
              disabled={busy || good.length === 0}
              className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-40"
            >
              {busy ? "Importing…" : `Import ${good.length} clean row${good.length === 1 ? "" : "s"}`}
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

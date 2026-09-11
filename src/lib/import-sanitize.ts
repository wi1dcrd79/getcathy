import { TRADE_PRESETS } from "@/lib/trade-presets";

/** Collapse odd whitespace, strip wrapping quotes, trim. */
export function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

/** Trim every cell and drop rows where every cell is empty. */
export function sanitizeRows(rows: Record<string, unknown>[]): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const row of rows) {
    const next: Record<string, string> = {};
    let any = false;
    for (const [k, v] of Object.entries(row)) {
      const key = clean(k);
      if (!key) continue;
      const val = clean(v);
      next[key] = val;
      if (val) any = true;
    }
    if (any) out.push(next);
  }
  return out;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function expandYear(raw: string): number {
  const n = Number(raw);
  if (raw.length === 4) return n;
  // 2-digit years: 70-99 => 19xx, else 20xx
  return n >= 70 ? 1900 + n : 2000 + n;
}

/**
 * Normalize MM/DD/YYYY, MM-DD-YY, YYYY-MM-DD, DD Mon YYYY and Excel serials
 * into an ISO date string (YYYY-MM-DD). Returns null when unparseable.
 */
export function parseDate(input: string): string | null {
  const s = clean(input);
  if (!s) return null;

  // Excel serial number
  if (/^\d{5}$/.test(s)) {
    const ms = (Number(s) - 25569) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = expandYear(m[3]!);
    // Default US MM/DD; fall back to DD/MM when the first part cannot be a month.
    return a > 12 ? iso(y, b, a) : iso(y, a, b);
  }

  m = s.match(/^(\d{1,2})[ -]([a-z]{3,})[ -](\d{2}|\d{4})$/i);
  if (m) {
    const mon = MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    if (mon) return iso(expandYear(m[3]!), mon, Number(m[1]));
  }

  m = s.match(/^([a-z]{3,})[ -](\d{1,2}),?[ -](\d{2}|\d{4})$/i);
  if (m) {
    const mon = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
    if (mon) return iso(expandYear(m[3]!), mon, Number(m[2]));
  }

  const fallback = new Date(s);
  if (!Number.isNaN(fallback.getTime())) return fallback.toISOString().slice(0, 10);
  return null;
}

/** Canonical craft titles the platform recognises, plus common field spellings. */
export const CRAFT_ALIASES: Record<string, string[]> = {
  "Combo Welder & Pipefitter": [
    "welder", "weldr", "wleder", "combo welder", "combowelder", "pipe welder",
    "pipewelder", "pipefitter", "pipe fitter", "fitter", "tig welder",
    "mig welder", "stick welder", "structural welder", "6g welder",
  ],
  Boilermaker: ["boilermaker", "boiler maker", "boilermkr", "bolier maker", "vessel welder"],
  "Commercial Plumber": [
    "plumber", "plummer", "commercial plumber", "journeyman plumber",
    "master plumber", "medical gas installer", "pipe layer",
  ],
  "Crane & Heavy Iron": [
    "crane operator", "craneop", "operator", "heavy equipment operator",
    "equipment operator", "forklift operator", "excavator operator",
    "telehandler operator", "heavy iron", "dozer operator",
  ],
  "Rigging & Safety": [
    "rigger", "riggr", "qualified rigger", "signalperson", "signal person",
    "safety", "safety officer", "scaffold builder", "scaffolder", "painter",
    "blaster", "general labor", "laborer", "labourer", "helper",
  ],
};

export const CANONICAL_CRAFTS = Object.keys(CRAFT_ALIASES);

const norm = (s: string) => clean(s).toLowerCase().replace(/[^a-z0-9]/g, "");

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length]!;
}

export interface CraftMatch {
  craft: string;
  exact: boolean;
  matched: boolean;
}

/**
 * Map a free-text craft/trade title onto a canonical craft.
 * Falls back to the original text (kept as a custom trade) when nothing is close.
 */
export function matchCraft(input: string, extraCrafts: string[] = []): CraftMatch {
  const raw = clean(input);
  if (!raw) return { craft: "General Labor", exact: false, matched: false };
  const n = norm(raw);

  const canonical = [...CANONICAL_CRAFTS, ...extraCrafts, ...TRADE_PRESETS.map((t) => t.title)];
  for (const c of canonical) {
    if (norm(c) === n) return { craft: c, exact: true, matched: true };
  }

  for (const [craft, aliases] of Object.entries(CRAFT_ALIASES)) {
    for (const alias of aliases) {
      const a = norm(alias);
      if (n === a || n.includes(a) || a.includes(n)) return { craft, exact: false, matched: true };
    }
  }

  let best: { craft: string; score: number } | null = null;
  for (const [craft, aliases] of Object.entries(CRAFT_ALIASES)) {
    for (const alias of [craft, ...aliases]) {
      const a = norm(alias);
      const d = editDistance(n, a);
      const score = d / Math.max(n.length, a.length);
      if (!best || score < best.score) best = { craft, score };
    }
  }
  if (best && best.score <= 0.34) return { craft: best.craft, exact: false, matched: true };
  return { craft: raw, exact: false, matched: false };
}

export type RowIssueLevel = "error" | "warning";

export interface RowIssue {
  level: RowIssueLevel;
  text: string;
}

import { supabase } from "@/integrations/supabase/client";
import type { PersonnelRecord, PersonnelCert } from "@/lib/personnel-data";

export interface CertificationType {
  code: string;
  name: string;
  requires_continuity: boolean;
}

export interface ContinuityLog {
  id: string;
  personnel_id: string;
  cert_type_code: string;
  performed_date: string;
  work_reference: string | null;
  verified_by: string | null;
}

export type DispatchStatus = "compliant" | "warning" | "lapsed" | "expired" | "missing_cert" | "unverified";

export interface DispatchEvaluation {
  status: DispatchStatus;
  isDispatchable: boolean;
  daysRemaining: number | null;
  reason: string;
  certCode: string | null;
  lastVerifiedWork: string | null;
}

export interface PersonnelDispatchRow {
  person: PersonnelRecord;
  cert: PersonnelCert | null;
  certType: CertificationType | null;
  evaluation: DispatchEvaluation;
}

const MS_DAY = 86_400_000;
const CONTINUITY_LIMIT_DAYS = 150;
const CONTINUITY_WARNING_DAYS = 120;
const EXPIRATION_WARNING_DAYS = 30;

function daysSince(dateStr: string): number {
  const then = new Date(dateStr + "T00:00:00").getTime();
  const today = new Date().setHours(0, 0, 0, 0);
  return Math.round((today - then) / MS_DAY);
}

function daysUntil(dateStr: string): number {
  const then = new Date(dateStr + "T00:00:00").getTime();
  const today = new Date().setHours(0, 0, 0, 0);
  return Math.round((then - today) / MS_DAY);
}

// Phase A/B tables are not yet in the auto-generated Database types,
// so query them through a loosely-typed handle on the same client.
const untyped = supabase as unknown as {
  from: (table: string) => {
    select: (cols: string) => {
      order: (
        col: string,
        opts?: { ascending?: boolean },
      ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
};

export async function fetchCertificationTypes(): Promise<CertificationType[]> {
  const { data, error } = await untyped
    .from("certification_types")
    .select("code, name, requires_continuity")
    .order("code");
  if (error) throw new Error(error.message);
  return (data ?? []) as CertificationType[];
}

export async function fetchContinuityLogs(): Promise<ContinuityLog[]> {
  const { data, error } = await untyped
    .from("craft_continuity_logs")
    .select("id, personnel_id, cert_type_code, performed_date, work_reference, verified_by")
    .order("performed_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ContinuityLog[];
}

/** Match a free-text cert_name to a certification type by code or name. */
export function matchCertType(
  certName: string,
  types: CertificationType[],
): CertificationType | null {
  const hay = certName.toUpperCase();
  return (
    types.find((t) => hay.includes(t.code.toUpperCase())) ??
    types.find((t) => hay.includes(t.name.toUpperCase())) ??
    null
  );
}

/**
 * Client-side mirror of app_internal.evaluate_craft_compliance:
 * dual-gate trades check hard expiration AND the 150-day rolling continuity
 * clock (warning at 120); single-gate trades check expiration only.
 */
export function evaluateDispatch(
  cert: PersonnelCert | null,
  certType: CertificationType | null,
  logs: ContinuityLog[],
  gateUnavailable = false,
): DispatchEvaluation {
  if (!cert) {
    return {
      status: "missing_cert",
      isDispatchable: false,
      daysRemaining: null,
      reason: "No active certification on file",
      certCode: certType?.code ?? null,
      lastVerifiedWork: null,
    };
  }

  if (cert.expiration_date && daysUntil(cert.expiration_date) < 0) {
    return {
      status: "expired",
      isDispatchable: false,
      daysRemaining: daysUntil(cert.expiration_date),
      reason: "Certification expired",
      certCode: certType?.code ?? null,
      lastVerifiedWork: null,
    };
  }

  // Fail closed: without gate tables we cannot tell dual-gate from single-gate.
  if (gateUnavailable) {
    return {
      status: "unverified",
      isDispatchable: false,
      daysRemaining: null,
      reason:
        "Continuity cannot be verified: dispatch-gate data is unavailable. Do not dispatch on calendar status alone.",
      certCode: certType?.code ?? null,
      lastVerifiedWork: null,
    };
  }

  if (certType?.requires_continuity) {
    const latest = logs
      .filter((l) => l.personnel_id === cert.personnel_id && l.cert_type_code === certType.code)
      .sort((a, b) => b.performed_date.localeCompare(a.performed_date))[0];
    const anchor = latest?.performed_date ?? cert.issue_date;
    const elapsed = daysSince(anchor);
    const remaining = CONTINUITY_LIMIT_DAYS - elapsed;

    if (elapsed > CONTINUITY_LIMIT_DAYS) {
      return {
        status: "lapsed",
        isDispatchable: false,
        daysRemaining: remaining,
        reason: `Continuity lapsed: ${elapsed} days since last verified work`,
        certCode: certType.code,
        lastVerifiedWork: latest?.performed_date ?? null,
      };
    }
    if (elapsed > CONTINUITY_WARNING_DAYS) {
      return {
        status: "warning",
        isDispatchable: true,
        daysRemaining: remaining,
        reason: `Continuity warning: ${elapsed} days since last verified work`,
        certCode: certType.code,
        lastVerifiedWork: latest?.performed_date ?? null,
      };
    }
    return {
      status: "compliant",
      isDispatchable: true,
      daysRemaining: cert.expiration_date ? daysUntil(cert.expiration_date) : remaining,
      reason: "Active and in full compliance",
      certCode: certType.code,
      lastVerifiedWork: latest?.performed_date ?? null,
    };
  }

  if (cert.expiration_date && daysUntil(cert.expiration_date) <= EXPIRATION_WARNING_DAYS) {
    return {
      status: "warning",
      isDispatchable: true,
      daysRemaining: daysUntil(cert.expiration_date),
      reason: `Expires in ${daysUntil(cert.expiration_date)} days`,
      certCode: certType?.code ?? null,
      lastVerifiedWork: null,
    };
  }

  return {
    status: "compliant",
    isDispatchable: true,
    daysRemaining: cert.expiration_date ? daysUntil(cert.expiration_date) : null,
    reason: "Active and in full compliance",
    certCode: certType?.code ?? null,
    lastVerifiedWork: null,
  };
}

/**
 * Severity ranking used to pick the worst evaluation across a person's certs.
 * Blocking statuses always beat dispatchable ones; among blocking statuses the
 * more severe reason wins so the row explains the real blocker.
 */
const STATUS_SEVERITY: Record<DispatchStatus, number> = {
  expired: 5,
  lapsed: 4,
  unverified: 3,
  missing_cert: 2,
  warning: 1,
  compliant: 0,
};

/**
 * Build one row per person by evaluating EVERY approved cert they hold and
 * surfacing the worst result. A person is dispatchable only if all of their
 * certs are dispatchable — a recent safety card must not hide a lapsed
 * welder continuity clock (fail closed).
 */
export function buildDispatchRows(
  people: PersonnelRecord[],
  certs: PersonnelCert[],
  types: CertificationType[],
  logs: ContinuityLog[],
  gateUnavailable = false,
): PersonnelDispatchRow[] {
  const approved = certs.filter((c) => c.approval_status === "approved");
  return people.map((person) => {
    const mine = approved
      .filter((c) => c.personnel_id === person.id)
      .sort((a, b) => b.issue_date.localeCompare(a.issue_date));

    let worst: PersonnelDispatchRow | null = null;
    for (const cert of mine) {
      const certType = matchCertType(cert.cert_name, types);
      const evaluation = evaluateDispatch(cert, certType, logs, gateUnavailable);
      const candidate: PersonnelDispatchRow = { person, cert, certType, evaluation };
      if (!worst) {
        worst = candidate;
        continue;
      }
      const candBlocks = !evaluation.isDispatchable;
      const worstBlocks = !worst.evaluation.isDispatchable;
      if (
        (candBlocks && !worstBlocks) ||
        (candBlocks === worstBlocks &&
          STATUS_SEVERITY[evaluation.status] > STATUS_SEVERITY[worst.evaluation.status])
      ) {
        worst = candidate;
      }
    }

    return (
      worst ?? {
        person,
        cert: null,
        certType: null,
        evaluation: evaluateDispatch(null, null, logs, gateUnavailable),
      }
    );
  });
}

/* ------------------------------------------------------------------ */
/* Continuity dashboard                                                */
/* ------------------------------------------------------------------ */

export interface ContinuityHolder {
  person: PersonnelRecord;
  cert: PersonnelCert;
  evaluation: DispatchEvaluation;
  /** Date the 150-day clock runs from (last verified work, else issue date). */
  anchorDate: string;
}

export interface TradeContinuitySummary {
  type: CertificationType;
  holders: ContinuityHolder[];
  lapsed: number;
  warning: number;
  compliant: number;
  logsLast30: number;
  logsLast90: number;
  recentLogs: ContinuityLog[];
}

/**
 * One summary per continuity-tracked trade (requires_continuity = true).
 * Each person is counted once per trade, using their most recently issued
 * approved cert for that trade. Uses the same 120/150-day rule as the gate.
 */
export function summarizeContinuityByTrade(
  people: PersonnelRecord[],
  certs: PersonnelCert[],
  types: CertificationType[],
  logs: ContinuityLog[],
): TradeContinuitySummary[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const approved = certs
    .filter((c) => c.approval_status === "approved")
    .sort((a, b) => b.issue_date.localeCompare(a.issue_date));

  return types
    .filter((t) => t.requires_continuity)
    .map((type) => {
      const seen = new Set<string>();
      const holders: ContinuityHolder[] = [];
      for (const cert of approved) {
        if (seen.has(cert.personnel_id)) continue;
        if (matchCertType(cert.cert_name, types)?.code !== type.code) continue;
        const person = byId.get(cert.personnel_id);
        if (!person) continue;
        seen.add(cert.personnel_id);
        const evaluation = evaluateDispatch(cert, type, logs);
        holders.push({
          person,
          cert,
          evaluation,
          anchorDate: evaluation.lastVerifiedWork ?? cert.issue_date,
        });
      }
      holders.sort(
        (a, b) => STATUS_SEVERITY[b.evaluation.status] - STATUS_SEVERITY[a.evaluation.status],
      );
      const typeLogs = logs
        .filter((l) => l.cert_type_code === type.code)
        .sort((a, b) => b.performed_date.localeCompare(a.performed_date));
      return {
        type,
        holders,
        lapsed: holders.filter((h) => h.evaluation.status === "lapsed").length,
        warning: holders.filter((h) => h.evaluation.status === "warning").length,
        compliant: holders.filter((h) => h.evaluation.status === "compliant").length,
        logsLast30: typeLogs.filter((l) => daysSince(l.performed_date) <= 30).length,
        logsLast90: typeLogs.filter((l) => daysSince(l.performed_date) <= 90).length,
        recentLogs: typeLogs.slice(0, 10),
      };
    });
}

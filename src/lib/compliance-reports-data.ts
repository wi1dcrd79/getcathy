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

export type DispatchStatus = "compliant" | "warning" | "lapsed" | "expired" | "missing_cert";

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

export async function fetchCertificationTypes(): Promise<CertificationType[]> {
  const { data, error } = await supabase
    .from("certification_types")
    .select("code, name, requires_continuity")
    .order("code");
  if (error) throw error;
  return (data ?? []) as unknown as CertificationType[];
}

export async function fetchContinuityLogs(): Promise<ContinuityLog[]> {
  const { data, error } = await supabase
    .from("craft_continuity_logs")
    .select("id, personnel_id, cert_type_code, performed_date, work_reference, verified_by")
    .order("performed_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ContinuityLog[];
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

/** Build one row per person using their most recent approved cert. */
export function buildDispatchRows(
  people: PersonnelRecord[],
  certs: PersonnelCert[],
  types: CertificationType[],
  logs: ContinuityLog[],
): PersonnelDispatchRow[] {
  const approved = certs.filter((c) => c.approval_status === "approved");
  return people.map((person) => {
    const mine = approved
      .filter((c) => c.personnel_id === person.id)
      .sort((a, b) => b.issue_date.localeCompare(a.issue_date));
    const cert = mine[0] ?? null;
    const certType = cert ? matchCertType(cert.cert_name, types) : null;
    return {
      person,
      cert,
      certType,
      evaluation: evaluateDispatch(cert, certType, logs),
    };
  });
}

import { supabase } from "@/integrations/supabase/client";

export interface PersonnelRecord {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  employee_id: string;
  trade_title: string;
  status: string;
}

export interface PersonnelCert {
  id: string;
  company_id: string;
  personnel_id: string;
  cert_name: string;
  cert_number: string | null;
  issue_date: string;
  expiration_date: string | null;
  approval_status: string;
  submitted_by: string | null;
  approved_at: string | null;
  verified_by: string | null;
  created_at: string;
}

export interface CustomTrade {
  id: string;
  company_id: string;
  trade_name: string;
  recurrence_months: number;
}

export async function fetchPersonnel(): Promise<PersonnelRecord[]> {
  const { data, error } = await supabase
    .from("personnel_records")
    .select("*")
    .order("last_name");
  if (error) throw error;
  return (data ?? []) as unknown as PersonnelRecord[];
}

export async function fetchCerts(): Promise<PersonnelCert[]> {
  const { data, error } = await supabase
    .from("personnel_certs")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PersonnelCert[];
}

export async function fetchCustomTrades(): Promise<CustomTrade[]> {
  const { data, error } = await supabase
    .from("custom_trades")
    .select("*")
    .order("trade_name");
  if (error) throw error;
  return (data ?? []) as unknown as CustomTrade[];
}

export async function addPersonnel(input: {
  first_name: string;
  last_name: string;
  employee_id: string;
  trade_title: string;
  companyId: string;
}) {
  const { error } = await supabase.from("personnel_records").insert({
    first_name: input.first_name,
    last_name: input.last_name,
    employee_id: input.employee_id,
    trade_title: input.trade_title,
    company_id: input.companyId,
    status: "active",
  } as never);
  if (error) throw error;
}

export async function submitCert(input: {
  personnel_id: string;
  cert_name: string;
  cert_number: string;
  issue_date: string;
  expiration_date: string | null;
  companyId: string;
  /** craftsman submissions land in the Pending QC Sign-off queue */
  pending: boolean;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;
  const { error } = await supabase.from("personnel_certs").insert({
    personnel_id: input.personnel_id,
    cert_name: input.cert_name,
    cert_number: input.cert_number || null,
    issue_date: input.issue_date,
    expiration_date: input.expiration_date,
    company_id: input.companyId,
    submitted_by: uid,
    approval_status: input.pending ? "pending" : "approved",
    approved_at: input.pending ? null : new Date().toISOString(),
    verified_by: input.pending ? null : uid,
  } as never);
  if (error) throw error;
}

/** QC sign-off — the continuity clock only resets once this runs. */
export async function approveCert(certId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;
  const { error } = await supabase
    .from("personnel_certs")
    .update({
      approval_status: "approved",
      approved_at: new Date().toISOString(),
      verified_by: uid,
    } as never)
    .eq("id", certId);
  if (error) throw error;
}

export async function rejectCert(certId: string) {
  const { error } = await supabase.from("personnel_certs").delete().eq("id", certId);
  if (error) throw error;
}

export async function addCustomTrade(input: {
  trade_name: string;
  recurrence_months: number;
  companyId: string;
}) {
  const { error } = await supabase.from("custom_trades").insert({
    trade_name: input.trade_name,
    recurrence_months: input.recurrence_months,
    company_id: input.companyId,
  } as never);
  if (error) throw error;
}

export function certStatus(expiration: string | null): "Active" | "Grace Period" | "Lapsed" {
  if (!expiration) return "Active";
  const days = Math.round(
    (new Date(expiration + "T00:00:00").getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (days < 0) return "Lapsed";
  if (days <= 30) return "Grace Period";
  return "Active";
}

export const QC_ROLES = ["company_admin", "safety_director", "qc_inspector"];

export type AssetCategory = "rigging" | "welder_cert" | "heavy_equipment" | "ppe";
export type InspectionResult = "Pass" | "Fail" | "Needs Service";
export type ComplianceStatus = "Compliant" | "Expiring Soon" | "Out of Compliance";
export type WelderStatus = "Active" | "Grace Period" | "Lapsed";

export interface AssetRow {
  id: string;
  asset_tag: string;
  name: string;
  category: AssetCategory;
  location: string;
  assigned_to: string | null;
  image_url: string | null;
  created_at: string;
}

export interface InspectionRow {
  id: string;
  asset_id: string;
  inspector_name: string;
  inspection_date: string;
  expiration_date: string;
  result: InspectionResult;
  notes: string | null;
}

export interface WelderRow {
  id: string;
  welder_name: string;
  welder_id_stamp: string;
  process: "SMAW" | "GTAW" | "GMAW" | "FCAW";
  standard: string;
  continuity_date: string;
  expiration_date: string;
}

const MS_DAY = 86_400_000;

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / MS_DAY);
}

export function monthsSince(dateStr: string): number {
  const from = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return (now.getTime() - from.getTime()) / (MS_DAY * 30.4375);
}

export function assetStatus(
  expiration_date: string,
  result: InspectionResult,
): ComplianceStatus {
  const d = daysUntil(expiration_date);
  if (d < 0 || result === "Fail") return "Out of Compliance";
  if (d <= 30) return "Expiring Soon";
  return "Compliant";
}

export function welderStatus(continuity_date: string): WelderStatus {
  const m = monthsSince(continuity_date);
  if (m < 5) return "Active";
  if (m < 6) return "Grace Period";
  return "Lapsed";
}

export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  rigging: "Rigging",
  welder_cert: "Welder Cert",
  heavy_equipment: "Heavy Equipment",
  ppe: "PPE",
};

export function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

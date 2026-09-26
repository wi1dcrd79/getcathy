/**
 * Columns that define the signed content of each record type. Shared by the
 * client (hash at capture time) and the server (re-verify before insert) so
 * both compute the identical RFC 8785 canonical hash.
 */
import { canonicalSha256 } from "./canonicalize";

export const SIGNED_COLUMNS = {
  inspections: [
    "id",
    "asset_id",
    "inspector_name",
    "inspection_date",
    "expiration_date",
    "result",
    "notes",
    "inspection_type",
    "company_id",
  ],
  risk_assessments: [
    "id",
    "company_id",
    "created_by",
    "asset_tag",
    "notes",
    "photo_count",
    "overall_risk",
    "summary",
    "actions",
  ],
  personnel_certs: [
    "id",
    "company_id",
    "personnel_id",
    "cert_name",
    "cert_number",
    "issue_date",
    "expiration_date",
    "approval_status",
  ],
} as const;

export type SignableTable = keyof typeof SIGNED_COLUMNS;

export const SIGNER_ROLES = [
  "company_admin",
  "safety_director",
  "qc_inspector",
  "field_supervisor",
] as const;

export function canSign(role: string | null | undefined): boolean {
  return !!role && (SIGNER_ROLES as readonly string[]).includes(role);
}

export function pickSignedColumns(
  row: Record<string, unknown>,
  columns: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of columns) out[col] = row[col] ?? null;
  return out;
}

export function hashRecord(table: SignableTable, row: Record<string, unknown>) {
  return canonicalSha256(pickSignedColumns(row, SIGNED_COLUMNS[table]));
}

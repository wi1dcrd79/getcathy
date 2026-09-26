import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canonicalSha256 } from "./canonicalize";

const AUTHORIZED_SIGNER_ROLES = [
  "company_admin",
  "safety_director",
  "qc_inspector",
  "field_supervisor",
] as const;

const sha256Regex = /^[0-9a-f]{64}$/;

const submitSignatureSchema = z
  .object({
    company_id: z.string().uuid(),
    audit_binder_id: z.string().uuid().nullish(),
    inspection_id: z.string().uuid().nullish(),
    cert_verification_id: z.string().uuid().nullish(),
    risk_assessment_id: z.string().uuid().nullish(),
    content_sha256: z.string().regex(sha256Regex, "content_sha256 must be a lowercase hex SHA-256"),
    signature_image_path: z.string().nullish(),
    offline_created_at: z.string().nullish(),
    signed_at: z.string().nullish(),
    device_metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .refine(
    (d) =>
      [d.audit_binder_id, d.inspection_id, d.cert_verification_id, d.risk_assessment_id].filter(
        (v) => v != null,
      ).length === 1,
    { message: "Exactly one signature target must be provided" },
  );

export class SignatureSubmissionError extends Error {
  constructor(
    public readonly status: 400 | 403 | 409,
    message: string,
  ) {
    super(message);
    this.name = "SignatureSubmissionError";
  }
}

/**
 * Columns that define the signed content of each record type. The server
 * recomputes the RFC 8785 canonical hash over these fields and requires it to
 * match the client-supplied content_sha256.
 */
const SIGNED_COLUMNS = {
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

function pickColumns(row: Record<string, unknown>, columns: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const col of columns) out[col] = row[col] ?? null;
  return out;
}

export const submitSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => submitSignatureSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Verify the caller's profile, tenant alignment, and authorized role.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, company_id, role")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      throw new SignatureSubmissionError(403, "Signer profile not found.");
    }
    if (profile.company_id !== data.company_id) {
      throw new SignatureSubmissionError(403, "Cross-tenant signature submission rejected.");
    }
    if (!AUTHORIZED_SIGNER_ROLES.includes(profile.role as (typeof AUTHORIZED_SIGNER_ROLES)[number])) {
      throw new SignatureSubmissionError(
        403,
        `Role ${profile.role} is not authorized to execute digital sign-offs.`,
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 2. Resolve the target record and verify the content hash.
    let targetColumn: "audit_binder_id" | "inspection_id" | "cert_verification_id" | "risk_assessment_id";
    let targetId: string;

    if (data.audit_binder_id) {
      targetColumn = "audit_binder_id";
      targetId = data.audit_binder_id;
      const { data: binder, error } = await supabaseAdmin
        .from("audit_binders")
        .select("id, company_id, content_sha256")
        .eq("id", targetId)
        .single();
      if (error || !binder || binder.company_id !== data.company_id) {
        throw new SignatureSubmissionError(400, "Audit binder not found in this company.");
      }
      if (!binder.content_sha256 || binder.content_sha256 !== data.content_sha256) {
        throw new SignatureSubmissionError(
          400,
          "Signature content hash does not match the compiled audit binder.",
        );
      }
    } else {
      const table =
        data.inspection_id != null
          ? "inspections"
          : data.risk_assessment_id != null
            ? "risk_assessments"
            : "personnel_certs";
      targetColumn =
        data.inspection_id != null
          ? "inspection_id"
          : data.risk_assessment_id != null
            ? "risk_assessment_id"
            : "cert_verification_id";
      targetId = (data.inspection_id ?? data.risk_assessment_id ?? data.cert_verification_id)!;

      const columns = SIGNED_COLUMNS[table];
      const { data: record, error } = await supabaseAdmin
        .from(table)
        .select(columns.join(", "))
        .eq("id", targetId)
        .single();
      if (error || !record) {
        throw new SignatureSubmissionError(400, `Target ${table} record not found.`);
      }
      if ((record as Record<string, unknown>)["company_id"] !== data.company_id) {
        throw new SignatureSubmissionError(403, "Cross-tenant signature submission rejected.");
      }
      const serverHash = await canonicalSha256(
        pickColumns(record as Record<string, unknown>, columns),
      );
      if (serverHash !== data.content_sha256) {
        throw new SignatureSubmissionError(
          400,
          "Signature content hash does not match the current record contents.",
        );
      }
    }

    // 3. First-signature-wins: reject if the target is already signed.
    const { data: existing } = await supabaseAdmin
      .from("signatures")
      .select("id")
      .eq(targetColumn, targetId)
      .maybeSingle();
    if (existing) {
      throw new SignatureSubmissionError(409, "This record has already been signed.");
    }

    // 4. Insert via the service role (direct client INSERT is revoked).
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("signatures")
      .insert({
        company_id: data.company_id,
        [targetColumn]: targetId,
        signer_id: userId,
        signer_role: profile.role, // trigger re-stamps authoritatively
        content_sha256: data.content_sha256,
        signature_image_path: data.signature_image_path ?? null,
        offline_created_at: data.offline_created_at ?? null,
        signed_at: data.signed_at ?? null,
        device_metadata: data.device_metadata,
      })
      .select("id, synced_at")
      .single();

    if (insertError) {
      // Unique-violation race: another signer won between the check and insert.
      if (insertError.code === "23505") {
        throw new SignatureSubmissionError(409, "This record has already been signed.");
      }
      throw new Error(`Failed to record signature: ${insertError.message}`);
    }

    return { ok: true as const, signature_id: inserted.id, synced_at: inserted.synced_at };
  });

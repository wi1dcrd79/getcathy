import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
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
    /** Base64 PNG (no data: prefix), capped ~400KB decoded. Uploaded server-side only. */
    signature_png_base64: z
      .string()
      .max(560_000, "Signature image too large")
      .regex(/^[A-Za-z0-9+/=]+$/, "Invalid base64")
      .nullish(),
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
  try {
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
      const row = record as unknown as Record<string, unknown>;
      if (row["company_id"] !== data.company_id) {
        throw new SignatureSubmissionError(403, "Cross-tenant signature submission rejected.");
      }
      const serverHash = await canonicalSha256(pickColumns(row, columns));
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

    // 4. Store the signature image server-side (no client write access to the bucket).
    const signatureId = crypto.randomUUID();
    let imagePath: string | null = null;
    const deviceMetadata: Record<string, unknown> = { ...data.device_metadata };
    if (data.signature_png_base64) {
      const bytes = Uint8Array.from(atob(data.signature_png_base64), (c) => c.charCodeAt(0));
      const isPng =
        bytes.length > 8 &&
        bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
      if (!isPng) throw new SignatureSubmissionError(400, "Signature image must be a PNG.");
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      deviceMetadata["image_sha256"] = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      imagePath = `${data.company_id}/${signatureId}.png`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("signatures")
        .upload(imagePath, bytes, { contentType: "image/png", upsert: false });
      if (uploadError) throw new Error(`Failed to store signature image: ${uploadError.message}`);
    }

    // 5. Insert via the service role (direct client INSERT is revoked).
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("signatures")
      .insert({
        id: signatureId,
        company_id: data.company_id,
        audit_binder_id: targetColumn === "audit_binder_id" ? targetId : null,
        inspection_id: targetColumn === "inspection_id" ? targetId : null,
        cert_verification_id: targetColumn === "cert_verification_id" ? targetId : null,
        risk_assessment_id: targetColumn === "risk_assessment_id" ? targetId : null,
        signer_id: userId,
        signer_role: profile.role, // trigger re-stamps authoritatively
        content_sha256: data.content_sha256,
        signature_image_path: imagePath,
        offline_created_at: data.offline_created_at ?? null,
        signed_at: data.signed_at ?? null,
        device_metadata: deviceMetadata as Json,
      })
      .select("id, synced_at")
      .single();

    if (insertError) {
      // Orphaned image cleanup — the row never landed.
      if (imagePath) await supabaseAdmin.storage.from("signatures").remove([imagePath]);
      // Unique-violation race: another signer won between the check and insert.
      if (insertError.code === "23505") {
        throw new SignatureSubmissionError(409, "This record has already been signed.");
      }
      throw new Error(`Failed to record signature: ${insertError.message}`);
    }

    return { ok: true as const, signature_id: inserted.id, synced_at: inserted.synced_at };
  } catch (e) {
    if (e instanceof SignatureSubmissionError) {
      return { ok: false as const, status: e.status, message: e.message };
    }
    throw e;
  }
  });

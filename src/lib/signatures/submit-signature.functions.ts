import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { canonicalSha256 } from "./canonicalize";
import { SIGNED_COLUMNS, pickSignedColumns as pickColumns } from "./signed-fields";

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
    incident_report_id: z.string().uuid().nullish(),
    incident_report_resolution_id: z.string().uuid().nullish(),
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
      [
        d.audit_binder_id,
        d.inspection_id,
        d.cert_verification_id,
        d.risk_assessment_id,
        d.incident_report_id,
        d.incident_report_resolution_id,
      ].filter((v) => v != null).length === 1,
    { message: "Exactly one signature target must be provided" },
  );

export interface ExistingSignature {
  signature_id: string;
  signer_role: string;
  synced_at: string;
  signed_by_me: boolean;
  content_sha256_matches: boolean;
}

export class SignatureSubmissionError extends Error {
  constructor(
    public readonly status: 400 | 403 | 409,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SignatureSubmissionError";
  }
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
      if (
        !AUTHORIZED_SIGNER_ROLES.includes(profile.role as (typeof AUTHORIZED_SIGNER_ROLES)[number])
      ) {
        throw new SignatureSubmissionError(
          403,
          `Role ${profile.role} is not authorized to execute digital sign-offs.`,
        );
      }

      const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
      // incident_reports columns are not in the generated DB types yet (added from GitHub).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabaseAdmin = typedAdmin as any;

      // 2. Resolve the target record and verify the content hash.
      let targetColumn:
        | "audit_binder_id"
        | "inspection_id"
        | "cert_verification_id"
        | "risk_assessment_id"
        | "incident_report_id"
        | "incident_report_resolution_id";
      let targetId: string;

      if (data.audit_binder_id) {
        targetColumn = "audit_binder_id";
        targetId = data.audit_binder_id;
        const { data: binder, error } = await supabaseAdmin
          .from("audit_binders")
          .select("id, company_id, content_sha256, status")
          .eq("id", targetId)
          .single();
        if (error || !binder || binder.company_id !== data.company_id) {
          throw new SignatureSubmissionError(400, "Audit binder not found in this company.");
        }
        if (binder.status !== "compiled") {
          throw new SignatureSubmissionError(
            409,
            `This binder is ${binder.status} and can't be signed.`,
            { code: "BINDER_NOT_SIGNABLE", binder_status: binder.status },
          );
        }
        if (!binder.content_sha256 || binder.content_sha256 !== data.content_sha256) {
          throw new SignatureSubmissionError(
            400,
            "Signature content hash does not match the compiled audit binder.",
          );
        }
      } else if (data.incident_report_resolution_id) {
        // Resolution signature: incident_report must exist and be "under_investigation"
        targetColumn = "incident_report_resolution_id";
        targetId = data.incident_report_resolution_id;
        const { data: incident, error } = await supabaseAdmin
          .from("incident_reports")
          .select("id, company_id, status, resolution_notes")
          .eq("id", targetId)
          .single();
        if (error || !incident || incident.company_id !== data.company_id) {
          throw new SignatureSubmissionError(400, "Incident report not found in this company.");
        }
        if (incident.status !== "under_investigation") {
          throw new SignatureSubmissionError(
            400,
            "Incident must be under investigation to sign resolution.",
          );
        }
        // Hash the resolution_notes only for this signature type
        const columns = ["id", "company_id", "resolution_notes"];
        const serverHash = await canonicalSha256(pickColumns(incident, columns));
        if (serverHash !== data.content_sha256) {
          throw new SignatureSubmissionError(
            400,
            "Resolution signature content hash does not match incident resolution notes.",
          );
        }
      } else {
        const table =
          data.inspection_id != null
            ? "inspections"
            : data.risk_assessment_id != null
              ? "risk_assessments"
              : data.incident_report_id != null
                ? "incident_reports"
                : "personnel_certs";
        targetColumn =
          data.inspection_id != null
            ? "inspection_id"
            : data.risk_assessment_id != null
              ? "risk_assessment_id"
              : data.incident_report_id != null
                ? "incident_report_id"
                : "cert_verification_id";
        targetId = (data.inspection_id ??
          data.risk_assessment_id ??
          data.incident_report_id ??
          data.cert_verification_id)!;

        const columns =
          SIGNED_COLUMNS[
            table as "inspections" | "risk_assessments" | "incident_reports" | "personnel_certs"
          ];
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

      // Describe the winning signature so the client can tell a lost response
      // (own, same content) apart from a real first-signature conflict.
      const alreadySigned = async () => {
        const { data: win } = await supabaseAdmin
          .from("signatures")
          .select("id, signer_id, signer_role, synced_at, content_sha256")
          .eq(targetColumn, targetId)
          .maybeSingle();
        return new SignatureSubmissionError(409, "This record has already been signed.", {
          code: "ALREADY_SIGNED",
          existing: win
            ? {
                signature_id: win.id,
                signer_role: win.signer_role,
                synced_at: win.synced_at,
                signed_by_me: win.signer_id === userId,
                content_sha256_matches: win.content_sha256 === data.content_sha256,
              }
            : null,
        });
      };

      // 3. First-signature-wins: reject if the target is already signed.
      const { data: existing } = await supabaseAdmin
        .from("signatures")
        .select("id")
        .eq(targetColumn, targetId)
        .maybeSingle();
      if (existing) {
        throw await alreadySigned();
      }

      // 4. Store the signature image server-side (no client write access to the bucket).
      const signatureId = crypto.randomUUID();
      let imagePath: string | null = null;
      const deviceMetadata: Record<string, unknown> = { ...data.device_metadata };
      if (data.signature_png_base64) {
        const bytes = Uint8Array.from(atob(data.signature_png_base64), (c) => c.charCodeAt(0));
        const isPng =
          bytes.length > 8 &&
          bytes[0] === 0x89 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x4e &&
          bytes[3] === 0x47;
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
          // Only the target column is sent: incident report columns aren't in the DB yet,
          // and sending them (even as null) makes the insert fail.
          [targetColumn]: targetId,
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
          throw await alreadySigned();
        }
        throw new Error(`Failed to record signature: ${insertError.message}`);
      }

      // 6. For incident resolution signatures, emit safety alert event if critical/high severity.
      if (targetColumn === "incident_report_resolution_id") {
        const { data: incident } = await supabaseAdmin
          .from("incident_reports")
          .select("severity")
          .eq("id", targetId)
          .single();
        if (incident && ["critical", "high"].includes(incident.severity)) {
          const { emitEvent } = await import("@/lib/inngest/emit.server");
          try {
            await (emitEvent as any)("incident.resolved", {
              company_id: data.company_id,
              incident_id: targetId,
              severity: incident.severity as "critical" | "high",
              resolved_by: userId,
            });
          } catch (e) {
            console.error(`[inngest] Failed to emit incident.resolved event: ${e}`);
            // Non-fatal: the signature is already recorded
          }
        }
      }

      return { ok: true as const, signature_id: inserted.id, synced_at: inserted.synced_at };
    } catch (e) {
      if (e instanceof SignatureSubmissionError) {
        return {
          ok: false as const,
          status: e.status,
          message: e.message,
          code: e.extra["code"] as string | undefined,
          binder_status: e.extra["binder_status"] as string | undefined,
          existing: e.extra["existing"] as ExistingSignature | null | undefined,
        };
      }
      throw e;
    }
  });

const signerIdentitySchema = z.object({ signature_id: z.string().uuid() });

/**
 * Resolve a signer's display identity for the verification panel.
 * RLS on profiles only exposes own row (or admin-tier), so a same-company
 * viewer would get null — this verifies the signature belongs to the caller's
 * company via the RLS-scoped client, then looks up the email with the admin client.
 */
export const getSignerIdentity = createServerFn({ method: "GET" })
  .inputValidator((data) => signerIdentitySchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: sig, error } = await context.supabase
      .from("signatures")
      .select("id, signer_id")
      .eq("id", data.signature_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sig) throw new Response("Not found", { status: 404 });

    const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
    // incident_reports columns are not in the generated DB types yet (added from GitHub).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = typedAdmin as any;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", sig.signer_id)
      .maybeSingle();
    return { email: profile?.email ?? null };
  });

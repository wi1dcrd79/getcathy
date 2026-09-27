import { createServerFn } from "@tanstack/react-start";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SIGNED_COLUMNS, pickSignedColumns, type SignableTable } from "./signatures/signed-fields";

const REVIEWER_ROLES = ["company_admin", "safety_director", "qc_inspector"];

const TARGET_COL: Record<SignableTable, "inspection_id" | "cert_verification_id" | "risk_assessment_id"> = {
  incident_reports: "incident_report_id" as "inspection_id",
  inspections: "inspection_id",
  personnel_certs: "cert_verification_id",
  risk_assessments: "risk_assessment_id",
};

const Input = z.object({
  title: z.string().trim().min(3).max(160),
  documents: z
    .array(
      z.object({
        name: z.string().max(200),
        mediaType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
        /** data:<mime>;base64,... */
        dataUrl: z.string().min(32),
      }),
    )
    .min(1)
    .max(5),
  records: z
    .array(z.object({ table: z.enum(["inspections", "personnel_certs", "risk_assessments"]), id: z.string().uuid() }))
    .min(1)
    .max(25),
  /** raw = full signed field values leave the DB for comparison; summary = labels, dates, cert numbers and hashes only */
  detailLevel: z.enum(["raw", "summary"]).default("raw"),
});

const Finding = z.object({
  severity: z.string(),
  kind: z.string(),
  record: z.string(),
  document: z.string(),
  detail: z.string(),
  recommendation: z.string(),
});
const Result = z.object({
  overall_status: z.string(),
  summary: z.string(),
  findings: z.array(Finding),
});
export type EvidenceFinding = z.infer<typeof Finding>;
export type EvidenceResult = z.infer<typeof Result>;

const SYSTEM = `You are a QA/QC compliance auditor for fabrication shops, pipe yards and heavy construction.
You compare uploaded audit documents (PDFs, scans, photos of paper forms) against the company's
digitally signed compliance records, and report missing or inconsistent evidence.

Rules:
- overall_status must be exactly one of: CONSISTENT, GAPS_FOUND, MAJOR_DISCREPANCIES.
- summary: at most 120 words, plain language.
- findings: every missing or inconsistent item you can justify. Empty list only if everything matches.
- severity: exactly HIGH, MEDIUM or LOW.
- kind: exactly one of MISSING_IN_DOCUMENT, MISSING_IN_RECORDS, MISMATCH, UNREADABLE, EXPIRED.
  MISMATCH = dates, results, cert numbers, names, asset tags or inspection types disagree.
- record: the record label as given (or "None" if the gap is document-only).
- document: the document file name (or "None" if the record has no supporting document).
- detail: quote both values when there is a mismatch.
- recommendation: one concrete corrective step.
- Never invent content that is not visible in a document. If a page is illegible, report UNREADABLE.
- Signed records are sealed and cannot be edited; corrections require a new record or version.`;

export const runEvidenceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role, is_super_admin")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("No company found for your account.");
    if (!REVIEWER_ROLES.includes(profile.role)) {
      throw new Error("Only company admins, safety directors and QC inspectors can run evidence reviews.");
    }

    // Load each selected record and its signature with the caller's own permissions (RLS scopes the company).
    const blocks: string[] = [];
    const refs: Array<{ table: string; id: string; label: string; signature_id: string }> = [];
    for (const r of data.records) {
      const cols = SIGNED_COLUMNS[r.table];
      const { data: row } = await supabase
        .from(r.table)
        .select(cols.join(", "))
        .eq("id", r.id)
        .eq("company_id", profile.company_id) // explicit tenant filter; RLS also enforces this
        .maybeSingle();
      const { data: sig } = await supabase
        .from("signatures")
        .select("id, signer_role, signed_at, synced_at, content_sha256")
        .eq(TARGET_COL[r.table], r.id)
        .eq("company_id", profile.company_id)
        .maybeSingle();
      if (!row || !sig) throw new Error("One of the selected records is not a signed record in your company.");
      const rec = row as unknown as Record<string, unknown>;
      const label = recordLabel(r.table, rec);
      refs.push({ table: r.table, id: r.id, label, signature_id: sig.id });
      const lines = [
        `RECORD: ${label}`,
        `type: ${r.table}`,
        `signed by role: ${sig.signer_role}; server sync time: ${sig.synced_at}`,
        `sealed sha256: ${sig.content_sha256}`,
      ];
      if (data.detailLevel === "raw") {
        lines.push(`sealed content: ${JSON.stringify(pickSignedColumns(rec, cols))}`);
      } else {
        // Summary mode: keep worker names, notes and free-text findings inside the DB.
        const summary: Record<string, unknown> = {};
        for (const c of cols) {
          const v = rec[c];
          if (v == null) continue;
          if (c.endsWith("_date") || c.endsWith("_at") || c === "cert_number" || c === "result" || c === "inspection_type" || c === "overall_risk" || c === "asset_tag" || c === "cert_name") {
            summary[c] = v;
          }
        }
        lines.push(`summary fields only: ${JSON.stringify(summary)}`);
      }
      blocks.push(lines.join("\n"));
    }

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured for this workspace.");
    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: key,
      headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image"; image: string }
      | { type: "file"; filename: string; data: string; mediaType: "application/pdf" }
    > = [
      {
        type: "text",
        text: `Audit: ${data.title}\n\nSIGNED COMPLIANCE RECORDS (${refs.length}):\n\n${blocks.join("\n\n")}\n\nUPLOADED DOCUMENTS follow, in order: ${data.documents.map((d) => d.name).join(", ")}`,
      },
    ];
    for (const d of data.documents) {
      content.push({ type: "text", text: `Document file name: ${d.name}` });
      if (d.mediaType === "application/pdf") {
        const base64 = d.dataUrl.slice(d.dataUrl.indexOf(",") + 1);
        content.push({ type: "file", filename: d.name, data: base64, mediaType: "application/pdf" });
      } else {
        content.push({ type: "image", image: d.dataUrl });
      }
    }

    let result: EvidenceResult;
    try {
      const stream = streamText({
        model: lovable.responses("openai/gpt-6-astra"),
        system: SYSTEM,
        messages: [{ role: "user", content }],
        output: Output.object({ schema: Result }),
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "medium",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      result = (await stream.output) as EvidenceResult;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw new Error("The review came back unreadable. Try again, or upload clearer documents.");
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("402")) throw new Error("AI credits are exhausted for this workspace. Add credits to continue.");
      if (message.includes("429")) throw new Error("The AI service is busy right now. Wait a moment and try again.");
      if (message.includes("403")) throw new Error("The AI service declined this request.");
      throw new Error(`Evidence review failed: ${message}`);
    }

    const { data: saved, error: saveErr } = await supabase
      .from("evidence_reviews")
      .insert({
        company_id: profile.company_id,
        created_by: userId,
        title: data.title,
        document_names: data.documents.map((d) => d.name),
        record_refs: refs,
        overall_status: result.overall_status,
        summary: result.summary,
        findings: result.findings,
      })
      .select("id")
      .maybeSingle();

    return { ...result, savedId: saved?.id ?? null, saveError: saveErr?.message ?? null };
  });

export function recordLabel(table: SignableTable, r: Record<string, unknown>): string {
  if (table === "inspections") return `Inspection · ${r["inspection_type"] ?? ""} · ${r["inspection_date"] ?? ""} · ${r["result"] ?? ""}`;
  if (table === "personnel_certs") return `Certification · ${r["cert_name"] ?? ""}${r["cert_number"] ? ` #${r["cert_number"]}` : ""}`;
  return `Risk review · ${r["asset_tag"] ?? "no tag"} · ${r["overall_risk"] ?? ""}`;
}

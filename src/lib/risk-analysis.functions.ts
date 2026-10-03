import { createServerFn } from "@tanstack/react-start";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PhotoSchema = z.object({
  /** data:image/...;base64,... */
  dataUrl: z.string().min(16),
});

const AnalyzeInput = z.object({
  notes: z.string().min(10),
  assetTag: z.string().nullable(),
  photos: z.array(PhotoSchema).max(8),
});

const RiskAction = z.object({
  title: z.string(),
  priority: z.string(),
  rationale: z.string(),
  responsible_role: z.string(),
  due_window: z.string(),
});

const RiskResult = z.object({
  overall_risk: z.string(),
  summary: z.string(),
  actions: z.array(RiskAction),
});

export type RiskAction = z.infer<typeof RiskAction>;
export type RiskResult = z.infer<typeof RiskResult>;

const SYSTEM_PROMPT = `You are a senior industrial safety and QA/QC advisor for pipe yards,
fabrication shops and heavy rigging operations. You review field inspection notes and asset
photographs and return a prioritized risk assessment.

Rules:
- overall_risk must be exactly one of: CRITICAL, HIGH, MODERATE, LOW.
- summary: at most 120 words, plain field language, name the specific hazards you can justify
  from the notes or photos. Never invent damage you cannot see or that is not described.
- actions: 2 to 6 corrective actions, ordered most urgent first.
- Each action priority must be exactly one of: P1, P2, P3.
- responsible_role: e.g. Rigging Supervisor, QC Inspector, Maintenance Lead, Yard Foreman.
- due_window: e.g. "Immediate - remove from service", "Within 24 hours", "Within 7 days".
- Cite the relevant OSHA / ASME / API practice inside rationale when one clearly applies.`;

export const analyzeRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyzeInput.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured for this workspace.");

    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: key,
      headers: {
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });

    const content: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [
      {
        type: "text",
        text: [
          data.assetTag ? `Asset tag: ${data.assetTag}` : "Asset tag: not provided",
          `Photos attached: ${data.photos.length}`,
          "",
          "Inspection notes from the safety manager:",
          data.notes,
        ].join("\n"),
      },
      ...data.photos.map((p) => ({ type: "image" as const, image: p.dataUrl })),
    ];

    let result: RiskResult;
    try {
      const stream = streamText({
        model: lovable.responses("openai/gpt-6-astra"),
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
        output: Output.object({ schema: RiskResult }),
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
      result = (await stream.output) as RiskResult;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw new Error(
          "The analysis came back unreadable. Try again with more detail in the notes.",
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("402")) {
        throw new Error("AI credits are exhausted for this workspace. Add credits to continue.");
      }
      if (message.includes("429")) {
        throw new Error(
          "The AI service is busy right now. Wait a moment and run the analysis again.",
        );
      }
      throw new Error(`Risk analysis failed: ${message}`);
    }

    // Persist the assessment for the audit trail (company scope enforced by RLS).
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();

    let savedId: string | null = null;
    let saveError: string | null = null;
    if (profile?.company_id) {
      const { data: row, error } = await context.supabase
        .from("risk_assessments")
        .insert({
          company_id: profile.company_id,
          created_by: context.userId,
          asset_tag: data.assetTag,
          notes: data.notes,
          photo_count: data.photos.length,
          overall_risk: result.overall_risk,
          summary: result.summary,
          actions: result.actions,
        } as never)
        .select("id")
        .maybeSingle();
      if (error) saveError = error.message;
      else savedId = (row as { id: string } | null)?.id ?? null;
    }

    return { ...result, savedId, saveError };
  });

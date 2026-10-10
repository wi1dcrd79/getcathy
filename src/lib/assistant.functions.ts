import { createServerFn } from "@tanstack/react-start";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SUPPORT_EMAIL } from "@/lib/legal";

const Message = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const AskInput = z.object({
  messages: z.array(Message).min(1).max(20),
  route: z.string().max(200).nullable(),
  /** Recent client-side failures the widget captured, newest last. */
  errors: z.array(z.string().max(1200)).max(6),
  online: z.boolean(),
});

export type AssistantMessage = z.infer<typeof Message>;

const SYSTEM_PROMPT = `You are CATHY Assist, the built-in support agent inside C.A.T.H.Y.
(Compliance, Asset Tracking & Heavy Yards) — a field app for pipe yards, fabrication shops
and heavy rigging crews used on rugged tablets and phones, often with poor signal.

What the app does, so you can guide people accurately:
- Dashboard (/): equipment and certification records, search, CSV export, audit binder.
- Yard Scanner (/scan-transfer): barcode/scanner-gun transfers between site > zone > bin,
  a manual PIN/tag keypad for gloved hands, and an offline queue that syncs on reconnect.
- Personnel (/personnel): crew certifications, trades, QC approval of submissions.
- Importer (/import): CSV bulk onboarding with a preview and duplicate checks.
- Audit Binder (/audit-binder): printable OSHA-ready compliance binder.
- AI Risk Review (/risk-analysis): inspection notes + photos to a ranked corrective plan.
- Billing (/billing), Account (/account), Company Admin (/company-admin).
- Plans: Free (3 assets), Field Yard Pro $279/mo, Enterprise Contractor $699/mo.
  Past-due accounts stay readable for 30 days but cannot add assets or log moves.

How to answer:
- Short, plain field language. No jargon, no code, no file names, no database talk.
- Lead with the fix or the next tap. Use at most 4 short bullet steps.
- If technical error details are supplied, translate them into what the user should do
  (retry, check signal, sign in again, refresh, contact support) — never paste the raw error.
- If the device is offline, say scans and transfers are saved on the device and sync later.
- If something is clearly broken beyond the user's control, say so plainly and point them to
  support at ${SUPPORT_EMAIL}.
- Never invent records, prices, or compliance rulings. Say when you are not sure.`;

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AskInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("The assistant is not configured for this workspace.");

    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: key,
      headers: {
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
    });

    const situation = [
      `Screen the user is on: ${data.route ?? "unknown"}`,
      `Device connection: ${data.online ? "online" : "OFFLINE"}`,
      data.errors.length
        ? `Recent failures captured in the app (newest last):\n${data.errors.join("\n---\n")}`
        : "No recent failures captured.",
    ].join("\n");

    try {
      // Caller-supplied "assistant" messages could steer the model as if they
      // were its own prior output. Only the server owns assistant/system roles:
      // re-wrap any client assistant turns as quoted user context.
      const safeMessages = data.messages.map((m) =>
        m.role === "assistant"
          ? { role: "user" as const, content: `[Earlier CATHY Assist reply, quoted for context]\n${m.content}` }
          : m,
      );

      const stream = streamText({
        model: lovable.responses("openai/gpt-6-astra"),
        system: `${SYSTEM_PROMPT}\n\nCurrent situation:\n${situation}`,
        messages: safeMessages,
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      const text = await stream.text;
      return { reply: text.trim() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("402")) {
        throw new Error("AI credits are exhausted for this workspace. Add credits to continue.");
      }
      if (message.includes("429")) {
        throw new Error("The assistant is busy right now. Wait a moment and ask again.");
      }
      throw new Error(`The assistant could not answer: ${message}`);
    }
  });

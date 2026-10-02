import type { ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";

// Guard shared by every assistant write tool. Runs as the approving user
// (never a service key), so RLS and role checks in the database still apply.
// Every call — success or refusal — is written to assistant_actions.

export const WRITE_ROLES = ["qc_inspector", "field_supervisor", "safety_director", "company_admin"] as const;

type Sb = ReturnType<typeof supabaseForUser>;
export type WriteCtx = { sb: Sb; companyId: string; role: string; userId: string; email: string | null };
type Result = { content: { type: "text"; text: string }[]; isError?: boolean; structuredContent?: Record<string, never> | { [k: string]: string | number | boolean | null } };

export class Refusal extends Error {}

async function log(sb: Sb, ctx: ToolContext, tool: string, input: unknown, result: "success" | "refused", detail?: string) {
  await sb.from("assistant_actions" as never).insert({
    assistant_id: ctx.getClientId() ?? "unknown",
    approving_user_id: ctx.getUserId(),
    tool_name: tool,
    input: JSON.parse(JSON.stringify(input ?? {})),
    result,
    detail: detail ?? null,
  } as never);
}

export async function runWrite(
  ctx: ToolContext,
  tool: string,
  input: unknown,
  fn: (w: WriteCtx) => Promise<{ text: string; data: { [k: string]: string | number | boolean | null } }>,
): Promise<Result> {
  if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Refused: not authenticated." }], isError: true };
  const sb = supabaseForUser(ctx);
  const refuse = async (msg: string): Promise<Result> => {
    await log(sb, ctx, tool, input, "refused", msg);
    return { content: [{ type: "text", text: `Refused: ${msg}` }], isError: true };
  };
  try {
    const userId = ctx.getUserId()!;
    const { data: profile } = await sb.from("profiles").select("role, company_id, email").eq("id", userId).maybeSingle();
    if (!profile?.company_id) return await refuse("your account is not linked to a company.");
    if (!(WRITE_ROLES as readonly string[]).includes(String(profile.role)))
      return await refuse(`role "${profile.role}" cannot use assistant write tools.`);
    const { data: grant } = await sb
      .from("assistant_grants" as never)
      .select("id")
      .eq("client_id" as never, (ctx.getClientId() ?? "") as never)
      .eq("scope" as never, "write_drafts" as never)
      .is("revoked_at" as never, null)
      .maybeSingle();
    if (!grant) return await refuse("this assistant was approved for read-only access. Grant \"write_drafts\" on the approval screen to allow drafts.");
    const out = await fn({ sb, companyId: profile.company_id, role: String(profile.role), userId, email: profile.email });
    await log(sb, ctx, tool, input, "success");
    return { content: [{ type: "text", text: out.text }], structuredContent: out.data };
  } catch (e) {
    return await refuse(e instanceof Error ? e.message : "request could not be completed.");
  }
}

export async function assetInCompany(sb: Sb, assetId: string, companyId: string) {
  const { data } = await sb.from("assets").select("id, asset_tag, status, company_id").eq("id", assetId).eq("company_id", companyId).maybeSingle();
  if (!data) throw new Refusal("asset not found in your company.");
  return data;
}

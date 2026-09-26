import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_inspections",
  title: "List inspections",
  description: "List recent inspections for your company with result and expiration date; optionally only failed ones.",
  inputSchema: {
    failed_only: z.boolean().default(false).describe("Only return failed inspections."),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ failed_only, limit }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    let q = supabaseForUser(ctx)
      .from("inspections")
      .select("id, asset_id, inspection_type, inspection_date, expiration_date, result, inspector_name")
      .order("inspection_date", { ascending: false })
      .limit(limit);
    if (failed_only) q = q.eq("result", "fail" as never);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const inspections = (data ?? []).map((i) => ({
      id: i.id, asset_id: i.asset_id, inspection_type: i.inspection_type,
      inspection_date: i.inspection_date, expiration_date: i.expiration_date,
      result: String(i.result), inspector_name: i.inspector_name,
    }));
    return { content: [{ type: "text", text: JSON.stringify(inspections) }], structuredContent: { inspections } };
  },
});

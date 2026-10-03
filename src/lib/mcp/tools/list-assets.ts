import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_assets",
  title: "List assets",
  description:
    "List your company's tracked assets with site, zone, bin and status; optionally search by name, tag or serial/VIN.",
  inputSchema: {
    search: z.string().trim().max(80).optional().describe("Match name, asset tag or serial/VIN."),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    let q = supabaseForUser(ctx)
      .from("assets")
      .select("id, asset_tag, name, serial_or_vin, category, status, site, zone, bin")
      .order("asset_tag")
      .limit(limit);
    if (search) {
      const s = search.replace(/[%,()]/g, "");
      q = q.or(`name.ilike.%${s}%,asset_tag.ilike.%${s}%,serial_or_vin.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const assets = (data ?? []).map((a) => ({
      id: a.id,
      asset_tag: a.asset_tag,
      name: a.name,
      serial_or_vin: a.serial_or_vin,
      category: String(a.category),
      status: a.status,
      site: a.site,
      zone: a.zone,
      bin: a.bin,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(assets) }],
      structuredContent: { assets },
    };
  },
});

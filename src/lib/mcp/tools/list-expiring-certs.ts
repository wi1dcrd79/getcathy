import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_expiring_certs",
  title: "List expiring certifications",
  description: "List your company's personnel certifications that are lapsed or expire within the given number of days.",
  inputSchema: {
    within_days: z.number().int().min(0).max(365).default(30).describe("Look-ahead window in days."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ within_days }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    const cutoff = new Date(Date.now() + within_days * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabaseForUser(ctx)
      .from("personnel_certs")
      .select("id, personnel_id, cert_name, cert_number, expiration_date, approval_status")
      .not("expiration_date", "is", null)
      .lte("expiration_date", cutoff)
      .order("expiration_date")
      .limit(200);
    if (error) throw new ToolError(error.message);
    const certs = (data ?? []).map((c) => ({
      id: c.id, personnel_id: c.personnel_id, cert_name: c.cert_name, cert_number: c.cert_number,
      expiration_date: c.expiration_date, approval_status: c.approval_status,
      state: c.expiration_date && c.expiration_date < today ? "lapsed" : "expiring",
    }));
    return { content: [{ type: "text", text: JSON.stringify(certs) }], structuredContent: { certs } };
  },
});

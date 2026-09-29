import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runWrite, assetInCompany, Refusal } from "../write-guard";

export default defineTool({
  name: "create_reinspection_task",
  title: "Create re-inspection task",
  description: "Open a re-inspection task for an asset that is expired or failed. Refused for active assets or when an open task already exists.",
  inputSchema: {
    asset_id: z.string().uuid(),
    due_date: z.string().date().optional().describe("YYYY-MM-DD; defaults to 3 days from now."),
    notes: z.string().max(1000).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) =>
    runWrite(ctx, "create_reinspection_task", input, async ({ sb, companyId }) => {
      const asset = await assetInCompany(sb, input.asset_id, companyId);
      const { data: insp } = await sb.from("inspections")
        .select("id, result, expiration_date").eq("asset_id", asset.id).eq("status" as never, "final" as never)
        .order("inspection_date", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const today = new Date().toISOString().slice(0, 10);
      const failedOrExpired = asset.status === "out_of_compliance" || !!insp && (String(insp.result) === "Fail" || insp.expiration_date < today);
      if (!insp || !failedOrExpired) throw new Refusal(`${asset.asset_tag} is not expired or failed; re-inspection tasks are only for those.`);
      const { data: dup } = await sb.from("corrective_actions").select("id")
        .eq("asset_id", asset.id).eq("source_type", "inspection")
        .in("status", ["open", "in_progress", "ready_for_review"]).like("description", "Re-inspection required%").limit(1);
      if (dup && dup.length) throw new Refusal(`an open re-inspection task already exists for ${asset.asset_tag} (${dup[0].id}).`);
      const due = input.due_date ? new Date(input.due_date).toISOString() : new Date(Date.now() + 3 * 864e5).toISOString();
      const { data, error } = await sb.from("corrective_actions").insert({
        company_id: companyId, source_type: "inspection", source_id: insp.id, asset_id: asset.id, priority: "P1",
        description: `Re-inspection required: ${asset.asset_tag}${input.notes ? ` — ${input.notes}` : ""}`,
        due_date: due, status: "open",
      }).select("id").single();
      if (error) throw new Refusal(error.message);
      return { text: `Re-inspection task ${data.id} opened for ${asset.asset_tag}, due ${due.slice(0, 10)}.`, data: { task_id: data.id, status: "open" } };
    }),
});

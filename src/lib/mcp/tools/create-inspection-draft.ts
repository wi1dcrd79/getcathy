import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runWrite, assetInCompany, Refusal } from "../write-guard";

export default defineTool({
  name: "create_inspection_draft",
  title: "Create inspection draft",
  description:
    "Create a DRAFT inspection for an asset. Drafts are never signed or final and do not change compliance status, the Yard Map or the Audit Binder.",
  inputSchema: {
    asset_id: z.string().uuid(),
    inspection_type: z.string().trim().min(1).max(80),
    result: z.enum(["Pass", "Fail", "Needs Service"]).optional(),
    notes: z.string().max(4000).optional(),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async (input, ctx) =>
    runWrite(ctx, "create_inspection_draft", input, async ({ sb, companyId, email }) => {
      const asset = await assetInCompany(sb, input.asset_id, companyId);
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await sb
        .from("inspections")
        .insert({
          asset_id: asset.id,
          company_id: companyId,
          inspection_type: input.inspection_type,
          result: (input.result ?? "Pass") as never,
          notes: input.notes ?? null,
          inspector_name: `Draft by assistant for ${email ?? "user"}`,
          inspection_date: today,
          expiration_date: today,
          status: "draft",
        } as never)
        .select("id")
        .single();
      if (error) throw new Refusal(error.message);
      const id = (data as { id: string }).id;
      return {
        text: `Draft inspection ${id} created for ${asset.asset_tag}. It is not final and cannot be signed until a person finalizes it in the app.`,
        data: { inspection_id: id, status: "draft" },
      };
    }),
});

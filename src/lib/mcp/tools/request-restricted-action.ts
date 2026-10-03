import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

// Explicit refusal endpoint: signing, binder compile/approve, role/user changes
// and deletions are never available to assistants. Logged as refused.
export default defineTool({
  name: "request_restricted_action",
  title: "Request restricted action (always refused)",
  description:
    "Assistants cannot sign or sign off inspections, compile or approve binders, change roles or users, or delete anything. Calling this records the attempt and returns a refusal.",
  inputSchema: {
    action: z.enum([
      "sign_inspection",
      "approve_binder",
      "compile_binder",
      "change_role",
      "manage_user",
      "delete",
    ]),
    target_id: z.string().max(100).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (ctx.isAuthenticated()) {
      await supabaseForUser(ctx)
        .from("assistant_actions" as never)
        .insert({
          assistant_id: ctx.getClientId() ?? "unknown",
          approving_user_id: ctx.getUserId(),
          tool_name: "request_restricted_action",
          input,
          result: "refused",
          detail: "restricted action",
        } as never);
    }
    return {
      content: [
        {
          type: "text",
          text: `Refused: "${input.action}" must be done by a person in the C.A.T.H.Y. app. Assistants can only create drafts and tasks.`,
        },
      ],
      isError: true,
    };
  },
});

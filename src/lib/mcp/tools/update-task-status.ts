import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runWrite, Refusal } from "../write-guard";

const ALLOWED: Record<string, string> = { open: "in_progress", in_progress: "ready_for_review" };

export default defineTool({
  name: "update_task_status",
  title: "Update task status",
  description: "Move a task open → in_progress or in_progress → ready_for_review. Tasks can't be completed or closed here; only a signed inspection closes a task.",
  inputSchema: {
    task_id: z.string().uuid(),
    status: z.string().trim().min(1).max(40),
    note: z.string().max(1000).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) =>
    runWrite(ctx, "update_task_status", input, async ({ sb, companyId }) => {
      if (!["in_progress", "ready_for_review"].includes(input.status))
        throw new Refusal(`status "${input.status}" is not allowed; only a signed inspection can complete or close a task.`);
      const { data: task } = await sb.from("corrective_actions").select("id, status, description")
        .eq("id", input.task_id).eq("company_id", companyId).maybeSingle();
      if (!task) throw new Refusal("task not found in your company.");
      if (ALLOWED[task.status] !== input.status) throw new Refusal(`cannot move a task from ${task.status} to ${input.status}.`);
      const description = input.note ? `${task.description}\n[assistant note] ${input.note}` : task.description;
      // Atomic conditional update: only succeeds if status is still what we read.
      const { data, error } = await sb.from("corrective_actions")
        .update({ status: input.status, description }).eq("id", task.id).eq("status", task.status).select("id");
      if (error) throw new Refusal(error.message);
      if (!data?.length) throw new Refusal("task changed meanwhile; try again.");
      return { text: `Task ${task.id} moved to ${input.status}.`, data: { task_id: task.id, status: input.status } };
    }),
});

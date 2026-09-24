import { supabaseAdmin } from "@/integrations/supabase/client.server";

type DeadLetterInput = {
  functionId: string;
  eventName: string;
  runId?: string | null;
  attempts?: number;
  error: unknown;
  payload: Record<string, unknown>;
  companyId?: string | null;
};

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown background job failure";
  }
}

/**
 * Terminal handler for a durable job that exhausted its retries.
 * Writes a scrubbed crash report (when the company is known) and always files
 * an entry in the admin dead-letter queue.
 */
export async function recordJobFailure(input: DeadLetterInput): Promise<void> {
  const detail = messageOf(input.error).slice(0, 1000);
  let crashReportId: string | null = null;

  if (input.companyId) {
    const { data, error } = await supabaseAdmin
      .from("crash_reports")
      .insert({
        company_id: input.companyId,
        reported_by: null,
        route: "/api/public/inngest",
        screen_label: "Background jobs",
        problem: `Background job failed: ${input.functionId}`.slice(0, 120),
        detail,
        severity: "error",
        device_kind: "Server",
        platform: "inngest",
        viewport: "n/a",
        app_build: "durable-jobs",
        was_offline: false,
        recovery_actions: [
          "Open the background job queue and review the failure detail.",
          "Retry the action from the app once the cause is fixed.",
        ],
      } as never)
      .select("id")
      .maybeSingle();
    if (error) console.error(`[inngest] crash_reports insert failed: ${error.message}`);
    else crashReportId = (data as { id: string } | null)?.id ?? null;
  }

  const { error: queueError } = await supabaseAdmin.from("job_failures").insert({
    company_id: input.companyId ?? null,
    function_id: input.functionId,
    event_name: input.eventName,
    run_id: input.runId ?? null,
    attempts: input.attempts ?? 0,
    status: "failed",
    error_message: detail,
    payload: input.payload,
    crash_report_id: crashReportId,
  } as never);
  if (queueError) console.error(`[inngest] job_failures insert failed: ${queueError.message}`);
}

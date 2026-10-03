import { inngest } from "../client";

const LOCK_NAME = "telemetry_sync";
const LOCK_LEASE_SECONDS = 300;
const WINDOW_HOURS = 24;
const OPEN_FAILURE_STATES = ["failed", "acknowledged", "retrying"];

// Load the service-role client lazily so env is read at request time.
async function admin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

export const telemetrySync = inngest.createFunction(
  {
    id: "telemetry-sync",
    concurrency: { limit: 1 },
    retries: 3,
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step, runId }) => {
    const acquired = await step.run("acquire-lock", async () => {
      const supabase = await admin();
      const { data, error } = await supabase.rpc("acquire_job_lock", {
        _name: LOCK_NAME,
        _holder: runId,
        _seconds: LOCK_LEASE_SECONDS,
      });
      if (error) throw error;
      return data as boolean;
    });

    if (!acquired) return { skipped: true, reason: "lock_held" };

    const companies = await step.run("fetch-companies", async () => {
      const supabase = await admin();
      const { data, error } = await supabase.from("companies").select("id");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string }>;
    });

    const windowStart = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    for (const company of companies) {
      await step.run(`sync-company-${company.id}`, async () => {
        const supabase = await admin();
        try {
          const { count: openCrashes, error: crashErr } = await supabase
            .from("crash_reports")
            .select("*", { count: "exact", head: true })
            .eq("company_id", company.id)
            .gte("created_at", windowStart)
            .eq("status", "open");
          if (crashErr) throw crashErr;

          const { count: crashOccurrences, error: occErr } = await supabase
            .from("crash_reports")
            .select("*", { count: "exact", head: true })
            .eq("company_id", company.id)
            .gte("created_at", windowStart);
          if (occErr) throw occErr;

          const { count: criticalRisks, error: riskErr } = await supabase
            .from("risk_assessments")
            .select("*", { count: "exact", head: true })
            .eq("company_id", company.id)
            .gte("created_at", windowStart)
            .in("overall_risk", ["CRITICAL", "HIGH"]);
          if (riskErr) throw riskErr;

          const { count: openJobFailures, error: jobErr } = await supabase
            .from("job_failures")
            .select("*", { count: "exact", head: true })
            .eq("company_id", company.id)
            .in("status", OPEN_FAILURE_STATES);
          if (jobErr) throw jobErr;

          const { error: insertErr } = await supabase.from("telemetry_syncs").insert({
            company_id: company.id,
            window_hours: WINDOW_HOURS,
            open_crashes: openCrashes ?? 0,
            crash_occurrences: crashOccurrences ?? 0,
            critical_risks: criticalRisks ?? 0,
            open_job_failures: openJobFailures ?? 0,
          });
          if (insertErr) throw insertErr;
        } catch (err) {
          await supabase.from("job_failures").insert({
            company_id: company.id,
            function_id: "telemetry-sync",
            event_name: "telemetry.sync",
            status: "failed",
            payload: { window_hours: WINDOW_HOURS, run_id: runId },
            error_message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    }

    return { synced_companies: companies.length };
  },
);

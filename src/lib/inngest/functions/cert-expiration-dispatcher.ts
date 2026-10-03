import { inngest } from "../client";

const THRESHOLDS = [30, 14, 7] as const;

type Candidate = {
  cert_id: string;
  company_id: string;
  cert_name: string;
  cert_number: string | null;
  expiration_date: string;
  welder_email: string | null;
  supervisor_email: string | null;
  admin_fallback_email: string | null;
};

// Load the service-role client lazily so env is read at request time.
async function admin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

function recipientsFor(c: Candidate): Array<{ role: string; email: string }> {
  const out: Array<{ role: string; email: string }> = [];
  if (c.welder_email) out.push({ role: "welder", email: c.welder_email });
  if (c.supervisor_email) out.push({ role: "supervisor", email: c.supervisor_email });
  if (!c.welder_email && !c.supervisor_email && c.admin_fallback_email) {
    out.push({ role: "admin_fallback", email: c.admin_fallback_email });
  }
  return out;
}

function renderEmail(c: Candidate, days: number, role: string) {
  const urgent = role === "admin_fallback";
  const subject = `${urgent ? "[ACTION REQUIRED] " : ""}Certification expires in ${days} days: ${c.cert_name}`;
  const html = `
    ${urgent ? `<p style="background:#b91c1c;color:#fff;padding:8px"><strong>No worker or supervisor email on file — escalated to company admin.</strong></p>` : ""}
    <p>The certification <strong>${c.cert_name}</strong>${c.cert_number ? ` (#${c.cert_number})` : ""} expires on <strong>${c.expiration_date}</strong> (${days} days).</p>
    <p>Please schedule renewal to avoid dispatch blocks.</p>`;
  return { subject, html };
}

export const certExpirationDispatcher = inngest.createFunction(
  {
    id: "cert-expiration-dispatcher",
    concurrency: { limit: 1 },
    retries: 0,
    triggers: [{ cron: "0 6 * * *" }],
  },
  async ({ step, runId }) => {
    const results: Record<string, { sent: number; failed: number }> = {};

    for (const days of THRESHOLDS) {
      results[`t${days}`] = await step.run(`process-threshold-${days}`, async () => {
        const supabase = await admin();
        const { sendCertEmail } = await import("@/lib/email/resend.server");

        const { data, error } = await supabase.rpc("find_certs_crossing_threshold", {
          p_threshold_days: days,
        });
        if (error) throw error;

        let sent = 0;
        let failed = 0;

        for (const c of (data ?? []) as Candidate[]) {
          for (const r of recipientsFor(c)) {
            const { data: claim, error: claimErr } = await supabase
              .from("cert_notifications")
              .insert({
                company_id: c.company_id,
                cert_id: c.cert_id,
                threshold_days: days,
                channel: "email",
                recipient_role: r.role,
                recipient_email: r.email,
                delivery_status: "claimed",
                notice_payload: {
                  cert_name: c.cert_name,
                  cert_number: c.cert_number,
                  expiration_date: c.expiration_date,
                },
              })
              .select("id")
              .single();
            if (claimErr) {
              if (claimErr.code === "23505") continue; // already claimed
              throw claimErr;
            }
            const notificationId = (claim as { id: string }).id;

            try {
              const { subject, html } = renderEmail(c, days, r.role);
              const { id } = await sendCertEmail({ to: r.email, subject, html });
              await supabase
                .from("cert_notifications")
                .update({
                  delivery_status: "dispatched",
                  provider_message_id: id,
                  dispatched_at: new Date().toISOString(),
                })
                .eq("id", notificationId);
              sent++;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              await supabase
                .from("cert_notifications")
                .update({ delivery_status: "failed" })
                .eq("id", notificationId);
              await supabase.from("job_failures").insert({
                company_id: c.company_id,
                function_id: "cert-expiration-dispatcher",
                event_name: "cert.expiring",
                run_id: runId,
                status: "failed",
                error_message: message.slice(0, 1000),
                payload: {
                  cert_id: c.cert_id,
                  threshold_days: days,
                  recipient_role: r.role,
                  cert_notification_id: notificationId,
                },
              });
              failed++;
            }
          }
        }

        // Individual failures are already recorded in job_failures; do not
        // re-throw — retries are disabled, so the batch must not retry as a whole.
        return { sent, failed };
      });
    }

    return results;
  },
);

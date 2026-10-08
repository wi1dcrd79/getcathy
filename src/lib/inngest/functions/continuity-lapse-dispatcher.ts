import { inngest } from "../client";

type Candidate = {
  company_id: string;
  personnel_id: string;
  cert_id: string;
  cert_name: string;
  cert_type_code: string;
  cert_type_name: string;
  anchor_date: string;
  days_elapsed: number;
  person_name: string;
  welder_email: string | null;
  supervisor_email: string | null;
  admin_fallback_email: string | null;
};

async function admin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

/** Welder + supervisor when present; admin only when both are missing. */
export function lapseRecipients(c: Pick<Candidate, "welder_email" | "supervisor_email" | "admin_fallback_email">) {
  const out: Array<{ role: string; email: string }> = [];
  if (c.welder_email) out.push({ role: "welder", email: c.welder_email });
  if (c.supervisor_email) out.push({ role: "supervisor", email: c.supervisor_email });
  if (!c.welder_email && !c.supervisor_email && c.admin_fallback_email) {
    out.push({ role: "admin_fallback", email: c.admin_fallback_email });
  }
  return out;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function renderEmail(c: Candidate, role: string) {
  const urgent = role === "admin_fallback";
  const subject = `${urgent ? "[ACTION REQUIRED] " : ""}DISPATCH BLOCKED: ${c.person_name} — ${c.cert_type_name} continuity lapsed`;
  const html = `
    ${urgent ? `<p style="background:#b91c1c;color:#fff;padding:8px"><strong>No worker or supervisor email on file — escalated to company admin.</strong></p>` : ""}
    <p style="background:#b91c1c;color:#fff;padding:8px"><strong>Dispatch blocked.</strong></p>
    <p><strong>${esc(c.person_name)}</strong> has gone <strong>${c.days_elapsed} days</strong> without verified ${esc(c.cert_type_name)} work (limit 150). Last verified work or issue date: <strong>${c.anchor_date}</strong>.</p>
    <p>Certification: ${esc(c.cert_name)}. This person cannot be dispatched for this trade until continuity is restored through retesting or verified work.</p>`;
  return { subject, html };
}

export const continuityLapseDispatcher = inngest.createFunction(
  {
    id: "continuity-lapse-dispatcher",
    concurrency: { limit: 1 },
    retries: 0,
    triggers: [{ cron: "17 6 * * *" }, { event: "continuity/dispatch.requested" }],
  },
  async ({ step, runId, event }) => {
    const ev = (event as { name?: string; data?: { company_id?: string } } | undefined) ?? {};
    const manual = ev.name === "continuity/dispatch.requested";
    const companyId = manual ? ev.data?.company_id : null;
    if (manual && !companyId) return { skipped: "company_id required for manual dispatch" };

    return step.run("process-lapses", async () => {
      const supabase = await admin();
      const { data, error } = await supabase.rpc("find_lapsed_continuity", {
        p_company_id: companyId ?? null,
      });
      if (error) {
        // Outbox not installed yet: send nothing.
        if (error.code === "PGRST202" || error.code === "42883") return { skipped: "outbox not installed" };
        throw error;
      }
      const { sendCertEmail } = await import("@/lib/email/resend.server");
      let sent = 0;
      let failed = 0;
      for (const c of ((data ?? []) as Candidate[]).slice(0, 200)) {
        for (const r of lapseRecipients(c)) {
          const { data: claim, error: claimErr } = await supabase
            .from("continuity_lapse_notifications")
            .insert({
              company_id: c.company_id,
              personnel_id: c.personnel_id,
              cert_id: c.cert_id,
              cert_type_code: c.cert_type_code,
              anchor_date: c.anchor_date,
              recipient_role: r.role,
              recipient_email: r.email,
              delivery_status: "claimed",
              notice_payload: { days_elapsed: c.days_elapsed, cert_name: c.cert_name },
            })
            .select("id")
            .single();
          if (claimErr) {
            if (claimErr.code === "23505") continue;
            throw claimErr;
          }
          const id = (claim as { id: string }).id;
          try {
            const { subject, html } = renderEmail(c, r.role);
            const res = await sendCertEmail({ to: r.email, subject, html });
            await supabase
              .from("continuity_lapse_notifications")
              .update({ delivery_status: "dispatched", provider_message_id: res.id, dispatched_at: new Date().toISOString() })
              .eq("id", id);
            sent++;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await supabase.from("continuity_lapse_notifications").update({ delivery_status: "failed" }).eq("id", id);
            await supabase.from("job_failures").insert({
              company_id: c.company_id,
              function_id: "continuity-lapse-dispatcher",
              event_name: "continuity.lapsed",
              run_id: runId,
              status: "failed",
              error_message: message.slice(0, 1000),
              payload: { personnel_id: c.personnel_id, cert_type_code: c.cert_type_code, recipient_role: r.role, notification_id: id },
            });
            failed++;
          }
        }
      }
      return { sent, failed };
    });
  },
);

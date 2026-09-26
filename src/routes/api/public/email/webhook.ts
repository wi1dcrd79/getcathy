import { createFileRoute } from '@tanstack/react-router';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Resend delivery webhook — advances cert_notifications through the delivery
 * lifecycle (dispatched → delivered) and records bounces/complaints as
 * job_failures. Configured as an external caller, so it lives under
 * /api/public/* and verifies the Svix signature itself.
 */

type ResendEvent = {
  type: string;
  data: {
    email_id?: string;
    bounce?: { message?: string } | null;
    [key: string]: unknown;
  };
};

const TERMINAL_STATUSES = new Set(['delivered', 'bounced', 'failed']);

async function adminClient() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}

/**
 * Svix signature verification (Resend signs its webhooks with Svix).
 * signedContent = `${svix-id}.${svix-timestamp}.${rawBody}`;
 * signature = base64(HMAC-SHA256(base64(secret without "whsec_" prefix), signedContent)).
 * Fail-closed: an unconfigured secret rejects the request — the endpoint never
 * accepts unsigned traffic.
 */
function verifySvixSignature(
  rawBody: string,
  headers: Headers,
  secret: string | undefined,
): { ok: boolean; reason?: string } {
  if (!secret || secret.trim() === '') {
    return { ok: false, reason: 'RESEND_WEBHOOK_SECRET is not configured' };
  }

  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatureHeader = headers.get('svix-signature');
  if (!id || !timestamp || !signatureHeader) {
    return { ok: false, reason: 'missing svix signature headers' };
  }

  const skewSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(skewSeconds) || skewSeconds > 300) {
    return { ok: false, reason: 'signature timestamp outside tolerance' };
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');

  const provided = signatureHeader.split(' ').filter(Boolean);
  const match = provided.some((sig) => {
    const sigValue = sig.replace(/^v1,/, '');
    const a = Buffer.from(sigValue);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });

  return match ? { ok: true } : { ok: false, reason: 'signature mismatch' };
}

async function findNotification(supabase: any, emailId: string) {
  const { data, error } = await supabase
    .from('cert_notifications')
    .select('id, company_id, delivery_status')
    .eq('provider_message_id', emailId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; company_id: string; delivery_status: string } | null;
}

async function handleDelivered(supabase: any, event: ResendEvent): Promise<boolean> {
  const emailId = event.data.email_id;
  if (!emailId) return false;
  const cert = await findNotification(supabase, emailId);
  if (!cert || cert.delivery_status !== 'dispatched') return false;

  const { error } = await supabase
    .from('cert_notifications')
    .update({ delivery_status: 'delivered', resolved_at: new Date().toISOString() })
    .eq('id', cert.id);
  if (error) throw error;
  return true;
}

async function handleBounced(supabase: any, event: ResendEvent): Promise<boolean> {
  const emailId = event.data.email_id;
  if (!emailId) return false;
  const cert = await findNotification(supabase, emailId);
  if (!cert || cert.delivery_status === 'delivered' || cert.delivery_status === 'bounced') return false;

  const { error } = await supabase
    .from('cert_notifications')
    .update({ delivery_status: 'bounced', resolved_at: new Date().toISOString() })
    .eq('id', cert.id);
  if (error) throw error;

  const bounceMessage = event.data.bounce?.message || 'unknown bounce';
  await supabase.from('job_failures').insert({
    company_id: cert.company_id,
    function_id: 'resend-webhook',
    event_name: 'email.bounced',
    status: 'failed',
    error_message: `Email bounced: ${bounceMessage}`.slice(0, 1000),
    payload: {
      cert_notification_id: cert.id,
      provider_message_id: emailId,
      bounce: event.data.bounce ?? null,
    },
  } as never);
  return true;
}

async function handleComplained(supabase: any, event: ResendEvent): Promise<boolean> {
  const emailId = event.data.email_id;
  if (!emailId) return false;
  const cert = await findNotification(supabase, emailId);
  if (!cert || cert.delivery_status === 'delivered' || cert.delivery_status === 'failed') return false;

  const { error } = await supabase
    .from('cert_notifications')
    .update({ delivery_status: 'failed', resolved_at: new Date().toISOString() })
    .eq('id', cert.id);
  if (error) throw error;

  await supabase.from('job_failures').insert({
    company_id: cert.company_id,
    function_id: 'resend-webhook',
    event_name: 'email.complained',
    status: 'failed',
    error_message: 'Recipient marked certification email as spam'.slice(0, 1000),
    payload: {
      cert_notification_id: cert.id,
      provider_message_id: emailId,
    },
  } as never);
  return true;
}

async function handleDeliveryDelayed(supabase: any, event: ResendEvent): Promise<boolean> {
  // Informational only: record the delay in job_failures without changing the
  // notification state — delivery may still succeed and arrive via email.delivered.
  const emailId = event.data.email_id;
  if (!emailId) return false;
  const cert = await findNotification(supabase, emailId);
  if (!cert) return false;

  await supabase.from('job_failures').insert({
    company_id: cert.company_id,
    function_id: 'resend-webhook',
    event_name: 'email.delivery_delayed',
    status: 'failed',
    error_message: 'Email delivery delayed by provider'.slice(0, 1000),
    payload: {
      cert_notification_id: cert.id,
      provider_message_id: emailId,
    },
  } as never);
  return true;
}

async function handleFailed(supabase: any, event: ResendEvent): Promise<boolean> {
  // Resend gave up sending (hard provider-side failure, distinct from a bounce).
  const emailId = event.data.email_id;
  if (!emailId) return false;
  const cert = await findNotification(supabase, emailId);
  if (!cert || cert.delivery_status === 'delivered' || cert.delivery_status === 'failed') return false;

  const { error } = await supabase
    .from('cert_notifications')
    .update({ delivery_status: 'failed', resolved_at: new Date().toISOString() })
    .eq('id', cert.id);
  if (error) throw error;

  await supabase.from('job_failures').insert({
    company_id: cert.company_id,
    function_id: 'resend-webhook',
    event_name: 'email.failed',
    status: 'failed',
    error_message: 'Email could not be sent (provider reported send failure)'.slice(0, 1000),
    payload: {
      cert_notification_id: cert.id,
      provider_message_id: emailId,
    },
  } as never);
  return true;
}

export const Route = createFileRoute('/api/public/email/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const verification = verifySvixSignature(
          rawBody,
          request.headers,
          process.env['RESEND_WEBHOOK_SECRET'],
        );
        if (!verification.ok) {
          console.warn(`[resend-webhook] rejected: ${verification.reason}`);
          return new Response('Invalid signature', { status: 401 });
        }

        let event: ResendEvent;
        try {
          event = JSON.parse(rawBody) as ResendEvent;
        } catch {
          return Response.json({ received: true });
        }

        const supabase = await adminClient();
        try {
          switch (event.type) {
            case 'email.delivered':
              await handleDelivered(supabase, event);
              break;
            case 'email.bounced':
              await handleBounced(supabase, event);
              break;
            case 'email.complained':
              await handleComplained(supabase, event);
              break;
            case 'email.delivery_delayed':
              await handleDeliveryDelayed(supabase, event);
              break;
            case 'email.failed':
              await handleFailed(supabase, event);
              break;
            default:
              console.log(`[resend-webhook] unhandled event: ${event.type}`);
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error(`[resend-webhook] handler error: ${message}`);
          // Never surface a 5xx for state-advance failures — Resend would
          // retry endlessly on an event we cannot apply.
          return Response.json({ received: true });
        }

        return Response.json({ received: true });
      },
    },
  },
});

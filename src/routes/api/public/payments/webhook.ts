import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import { verifyWebhook, EventName, type PaddleEnv } from '@/lib/paddle.server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSupabase(): any {
  if (!_supabase) {
    _supabase = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_SERVICE_ROLE_KEY']!);
  }
  return _supabase;
}

const TIER_BY_PRICE: Record<string, { tier: string; seats: number }> = {
  field_yard_pro_monthly: { tier: 'pro', seats: 5 },
  enterprise_contractor_monthly: { tier: 'enterprise', seats: 999999 },
};

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

async function syncCompanyPlan(companyId: string | undefined, priceId: string, status: string) {
  if (!companyId) return;
  const mapping = TIER_BY_PRICE[priceId];
  const active = ACTIVE_STATUSES.has(status);
  const patch = active
    ? { subscription_tier: mapping?.tier ?? 'pro', seat_limit: mapping?.seats ?? 5, subscription_status: status }
    : { subscription_tier: 'free', seat_limit: 1, subscription_status: status };
  await getSupabase().from('companies').update(patch).eq('id', companyId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionUpsert(data: any, env: PaddleEnv) {
  const { id, customerId, items, status, currentBillingPeriod, customData, scheduledChange } = data;

  const userId = customData?.userId;
  const companyId = customData?.companyId;
  if (!userId) {
    console.error('No userId in customData');
    return;
  }

  const item = items?.[0];
  const priceId = item?.price?.importMeta?.externalId;
  const productId = item?.product?.importMeta?.externalId;
  if (!priceId || !productId) {
    console.warn('Skipping subscription: missing importMeta.externalId');
    return;
  }

  await getSupabase()
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        company_id: companyId ?? null,
        paddle_subscription_id: id,
        paddle_customer_id: customerId,
        product_id: productId,
        price_id: priceId,
        status,
        current_period_start: currentBillingPeriod?.startsAt,
        current_period_end: currentBillingPeriod?.endsAt,
        cancel_at_period_end: scheduledChange?.action === 'cancel',
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'paddle_subscription_id' },
    );

  await syncCompanyPlan(companyId, priceId, status);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionCanceled(data: any, env: PaddleEnv) {
  const supabase = getSupabase();
  const { data: row } = await supabase
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('paddle_subscription_id', data.id)
    .eq('environment', env)
    .select('company_id, price_id')
    .maybeSingle();

  if (row?.['company_id']) {
    await syncCompanyPlan(row['company_id'] as string, String(row['price_id'] ?? ''), 'canceled');
  }
}

async function handleWebhook(req: Request, env: PaddleEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.eventType) {
    case EventName.SubscriptionCreated:
    case EventName.SubscriptionUpdated:
      await handleSubscriptionUpsert(event.data, env);
      break;
    case EventName.SubscriptionCanceled:
      await handleSubscriptionCanceled(event.data, env);
      break;
    default:
      console.log('Unhandled event:', event.eventType);
  }
}

export const Route = createFileRoute('/api/public/payments/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const env = (url.searchParams.get('env') || 'sandbox') as PaddleEnv;
        try {
          await handleWebhook(request, env);
          return Response.json({ received: true });
        } catch (e) {
          console.error('Webhook error:', e);
          return new Response('Webhook error', { status: 400 });
        }
      },
    },
  },
});

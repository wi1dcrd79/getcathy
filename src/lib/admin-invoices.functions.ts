import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gatewayFetch, type PaddleEnv } from "@/lib/paddle.server";

export interface AdminInvoice {
  id: string;
  invoiceNumber: string | null;
  status: string;
  currency: string;
  total: string;
  billedAt: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  companyName: string | null;
  customerEmail: string | null;
}

interface PaddleTxn {
  id: string;
  status: string;
  invoice_number?: string | null;
  billed_at?: string | null;
  created_at?: string | null;
  currency_code?: string;
  customer_id?: string | null;
  subscription_id?: string | null;
  customer?: { email?: string | null } | null;
  details?: { totals?: { grand_total?: string; currency_code?: string } } | null;
}

/**
 * Platform-owner view of every Paddle transaction/invoice, joined to the
 * company that owns the Paddle customer. Owner-only: verified server-side.
 */
export const listAdminInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { environment: PaddleEnv }) => data)
  .handler(async ({ data, context }): Promise<AdminInvoice[]> => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile || !(profile as { is_super_admin?: boolean }).is_super_admin) {
      throw new Error("Forbidden");
    }

    const res = await gatewayFetch(
      data.environment,
      "/transactions?per_page=100&order_by=billed_at[DESC]&include=customer",
    );
    if (!res.ok) throw new Error(`Paddle request failed (${res.status})`);
    const payload = (await res.json()) as { data?: PaddleTxn[] };
    const txns = payload.data ?? [];

    // Map Paddle customers to companies via stored subscriptions (service role:
    // the owner must see every company, not just their own).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("paddle_customer_id, company_id, companies(name)");

    const nameByCustomer = new Map<string, string>();
    for (const row of (subs ?? []) as unknown as Array<{
      paddle_customer_id: string;
      companies?: { name?: string } | null;
    }>) {
      const name = row.companies?.name;
      if (row.paddle_customer_id && name) nameByCustomer.set(row.paddle_customer_id, name);
    }

    return txns.map((t) => ({
      id: t.id,
      invoiceNumber: t.invoice_number ?? null,
      status: t.status,
      currency: t.details?.totals?.currency_code ?? t.currency_code ?? "USD",
      total: t.details?.totals?.grand_total ?? "0",
      billedAt: t.billed_at ?? t.created_at ?? null,
      customerId: t.customer_id ?? null,
      subscriptionId: t.subscription_id ?? null,
      companyName: t.customer_id ? (nameByCustomer.get(t.customer_id) ?? null) : null,
      customerEmail: t.customer?.email ?? null,
    }));
  });

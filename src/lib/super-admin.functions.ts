import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { seatsForTier, type PlanTier } from "@/lib/plans";

const Input = z.object({
  id: z.string().uuid(),
  tier: z.enum(["free", "pro", "enterprise"]).optional(),
  seats: z.number().int().min(1).max(10000).optional(),
});

/**
 * Billing fields (tier / seats) can only change via Paddle webhook or a
 * verified platform super-admin. Authority is read server-side from the
 * caller's own profile row — never trusted from the client.
 */
export const updateCompanyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: me, error: meErr } = await context.supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", context.userId)
      .maybeSingle();
    if (meErr || !me?.is_super_admin) throw new Error("Forbidden");

    const patch: { subscription_tier?: string; seat_limit?: number } = {};
    if (data.tier !== undefined) {
      patch.subscription_tier = data.tier;
      patch.seat_limit = seatsForTier(data.tier as PlanTier);
    }
    if (data.seats !== undefined) patch.seat_limit = data.seats;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("companies").update(patch).eq("id", data.id);
    if (error) throw new Error("Could not update company plan");
    return { ok: true };
  });

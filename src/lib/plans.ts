export type PlanTier = "free" | "pro" | "enterprise";

export interface PlanDef {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  priceMonthly: number;
  seats: number;
  assetLimit: number;
  features: string[];
}

export const FREE_ASSET_LIMIT = 3;
export const UNLIMITED = 999999;

export const PLANS: Record<PlanTier, PlanDef> = {
  free: {
    tier: "free",
    name: "Free",
    priceLabel: "$0",
    priceMonthly: 0,
    seats: 1,
    assetLimit: FREE_ASSET_LIMIT,
    features: [`${FREE_ASSET_LIMIT} tracked assets`, "1 seat", "Yard transfers & scan logging"],
  },
  pro: {
    tier: "pro",
    name: "Field Yard Pro",
    priceLabel: "$279/mo",
    priceMonthly: 279,
    seats: 5,
    assetLimit: UNLIMITED,
    features: [
      "Unlimited assets, bins and yard transfers",
      "Up to 5 crew seats with roles and permissions",
      "One-click OSHA / client audit binder (PDF)",
      "Full immutable location + inspection history",
      "Welder continuity alerts",
    ],
  },
  enterprise: {
    tier: "enterprise",
    name: "Enterprise Contractor",
    priceLabel: "$699/mo",
    priceMonthly: 699,
    seats: UNLIMITED,
    features: [
      "Everything in Field Yard Pro",
      "Unlimited crew seats",
      "Multi-yard / multi-site switching",
      "Priority audit binder export queue",
      "Dedicated compliance support",
    ],
    assetLimit: UNLIMITED,
  },
};

export const PAID_TIERS: PlanTier[] = ["pro", "enterprise"];

export function planFor(tier: string | null | undefined): PlanDef {
  return PLANS[(tier as PlanTier) ?? "free"] ?? PLANS.free;
}

export function seatsForTier(tier: PlanTier): number {
  return PLANS[tier].seats;
}

/**
 * Plan-aware checkout entry point. Once built-in payments are switched on this
 * calls the checkout session creator with the selected tier's price config.
 */
export async function startCheckout(tier: PlanTier): Promise<{ url: string | null; message: string }> {
  return {
    url: null,
    message: `Secure checkout for ${PLANS[tier].name} (${PLANS[tier].priceLabel}) is not connected yet.`,
  };
}

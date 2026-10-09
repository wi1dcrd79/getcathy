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
export const PRO_ASSET_LIMIT = 15;
export const PRO_SEATS = 3;
export const UNLIMITED = 999999;

export const PLANS: Record<PlanTier, PlanDef> = {
  free: {
    tier: "free",
    name: "Free",
    priceLabel: "$0",
    priceMonthly: 0,
    seats: 1,
    assetLimit: FREE_ASSET_LIMIT,
    features: [`${FREE_ASSET_LIMIT} tracked assets`, "1 crew seat", "Yard transfers & scan logging"],
  },
  pro: {
    tier: "pro",
    name: "Field Yard Pro",
    priceLabel: "$279/mo",
    priceMonthly: 279,
    seats: PRO_SEATS,
    assetLimit: PRO_ASSET_LIMIT,
    features: [
      `Up to ${PRO_ASSET_LIMIT} tracked assets, bins and yard transfers`,
      `Up to ${PRO_SEATS} crew seats with roles and permissions`,
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
      "Unlimited tracked assets",
      "Unlimited crew seats",
      "Multi-yard / multi-site switching",
      "Priority audit binder export queue",
      "Dedicated compliance support",
    ],
    assetLimit: UNLIMITED,
  },
};

export const PADDLE_PRICE_BY_TIER: Record<"pro" | "enterprise", string> = {
  pro: "field_yard_pro_monthly",
  enterprise: "enterprise_contractor_monthly",
};

export const PAID_TIERS: PlanTier[] = ["pro", "enterprise"];

export function normalizeTier(tier: string | null | undefined): PlanTier {
  return tier === "pro" || tier === "enterprise" ? tier : "free";
}

export function planFor(tier: string | null | undefined): PlanDef {
  return PLANS[normalizeTier(tier)];
}

export function seatsForTier(tier: PlanTier): number {
  return PLANS[tier].seats;
}

/** Asset cap for a tier; null means unlimited. */
export function assetLimitForTier(tier: string | null | undefined): number | null {
  const t = normalizeTier(tier);
  return t === "enterprise" ? null : PLANS[t].assetLimit;
}

/** True when one more new asset would exceed the tier's cap. */
export function isAtAssetLimit(tier: string | null | undefined, currentCount: number): boolean {
  const limit = assetLimitForTier(tier);
  return limit !== null && currentCount >= limit;
}

/** The tier to suggest when a limit is hit. */
export function upgradeTargetFor(tier: string | null | undefined): "pro" | "enterprise" {
  return normalizeTier(tier) === "free" ? "pro" : "enterprise";
}

/** Plain-language upgrade reason shown when a tier's asset cap is reached. */
export function assetLimitReason(tier: string | null | undefined): string {
  return normalizeTier(tier) === "pro"
    ? `Field Yard Pro tracks up to ${PRO_ASSET_LIMIT} assets. Upgrade to Enterprise Contractor for unlimited yard inventory.`
    : `Free accounts track up to ${FREE_ASSET_LIMIT} assets. Upgrade to Field Yard Pro to track up to ${PRO_ASSET_LIMIT}.`;
}

export interface BulkImportCheck {
  ok: boolean;
  newCount: number;
  limit: number | null;
  message: string | null;
}

/**
 * Pre-check a CSV asset import. Only tags not already in the yard count toward the
 * cap; matching tags are updates. The database trigger stays the final authority.
 */
export function checkBulkAssetImport(params: {
  tier: string | null | undefined;
  existingCount: number;
  existingTags: Iterable<string>;
  incomingTags: string[];
}): BulkImportCheck {
  const known = new Set(Array.from(params.existingTags, (t) => t.trim().toLowerCase()));
  const fresh = new Set<string>();
  for (const raw of params.incomingTags) {
    const t = raw.trim().toLowerCase();
    if (t && !known.has(t)) fresh.add(t);
  }
  const newCount = fresh.size;
  const limit = assetLimitForTier(params.tier);
  if (limit === null || params.existingCount + newCount <= limit) {
    return { ok: true, newCount, limit, message: null };
  }
  const room = Math.max(0, limit - params.existingCount);
  const plan = planFor(params.tier).name;
  return {
    ok: false,
    newCount,
    limit,
    message: `Import stopped before anything was saved: this file adds ${newCount} new asset${newCount === 1 ? "" : "s"}, but your ${plan} plan has room for ${room} more (limit ${limit}). Upgrade or trim the file and try again.`,
  };
}

import { useEffect, useState } from "react";
import {
  FREE_ASSET_LIMIT,
  PADDLE_PRICE_BY_TIER,
  PLANS,
  PRO_ASSET_LIMIT,
  PRO_SEATS,
  upgradeTargetFor,
  type PlanTier,
} from "@/lib/plans";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useExternalBillingGuard } from "@/lib/platform";

export function UpgradeModal({
  open,
  reason,
  onClose,
}: {
  open: boolean;
  reason: string;
  onClose: () => void;
}) {
  const { companyId, tier } = useProfile();
  // Pro companies only see the Enterprise step up; Free sees both.
  const choices: PlanTier[] = tier === "pro" ? ["enterprise"] : ["pro", "enterprise"];
  const [selected, setSelected] = useState<PlanTier>(upgradeTargetFor(tier));
  useEffect(() => {
    if (open) setSelected(upgradeTargetFor(tier));
  }, [open, tier]);
  const [notice, setNotice] = useState<string | null>(null);
  const { openCheckout, loading } = usePaddleCheckout();
  const { session } = useAuth();
  const { guarded, native, webBillingUrl } = useExternalBillingGuard();

  if (!open) return null;

  const plan = PLANS[selected];

  const handleCheckout = async () => {
    setNotice(null);
    try {
      await openCheckout({
        priceId: PADDLE_PRICE_BY_TIER[selected as "pro" | "enterprise"],
        ...(session?.user.email ? { customerEmail: session.user.email } : {}),
        customData: {
          userId: session?.user.id ?? "",
          companyId: companyId ?? "",
        },
        successUrl: `${window.location.origin}/?checkout=success`,
      });
    } catch (e) {
      console.error("checkout failed", e);
      setNotice("Could not open checkout. Check your connection and try again.");
    }
  };

  return (
    <div className="no-print fixed inset-0 z-[60] flex items-end justify-center bg-background/85 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-primary/40 bg-surface sm:rounded-2xl">
        <div className="hazard-stripe h-1.5 w-full" />
        <div className="p-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
            Plan limit reached
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold uppercase leading-tight">
            Choose your plan
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{reason}</p>

          <div className="mt-4 grid gap-2">
            {choices.map((choice) => {
              const p = PLANS[choice];
              const active = selected === choice;
              return (
                <button
                  key={choice}
                  onClick={() => setSelected(choice)}
                  className={`min-h-12 rounded-lg border p-3 text-left transition ${
                    active ? "border-primary bg-primary/10" : "border-border bg-input"
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className="font-display text-sm font-bold uppercase tracking-wide">
                      {p.name}
                    </span>
                    <span className="text-sm font-bold text-primary">{p.priceLabel}</span>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {choice === "enterprise"
                      ? "Unlimited assets · unlimited seats · multi-yard"
                      : `${PRO_ASSET_LIMIT} assets · ${PRO_SEATS} seats`}
                  </span>
                </button>
              );
            })}
          </div>

          <ul className="mt-4 space-y-2">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-success">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 rounded-md border border-border bg-input px-3 py-2 text-xs text-muted-foreground">
            {notice ??
              (guarded
                ? `Subscriptions for this B2B workspace are purchased and managed on the web console${
                    native ? " outside the mobile app" : ""
                  }. Free includes ${FREE_ASSET_LIMIT} tracked assets; Field Yard Pro includes ${PRO_ASSET_LIMIT}.`
                : `Free includes ${FREE_ASSET_LIMIT} tracked assets; Field Yard Pro includes ${PRO_ASSET_LIMIT}. Preview checkouts run in test mode — no real charges.`)}
          </p>

          {guarded ? (
            <a
              href={webBillingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-center text-sm font-bold uppercase tracking-widest text-primary-foreground"
            >
              Manage Subscription on Web Console
            </a>
          ) : (
            <button
              onClick={handleCheckout}
              disabled={loading}
              className="mt-4 w-full rounded-lg disabled:opacity-60 bg-primary px-4 py-3 text-sm font-bold uppercase tracking-widest text-primary-foreground"
            >
              {loading ? "Opening checkout…" : `Upgrade to ${plan.name}`}
            </button>
          )}
          <button
            onClick={onClose}
            className="mt-2 w-full rounded-lg border border-border px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            Keep using free plan
          </button>
        </div>
      </div>
    </div>
  );
}

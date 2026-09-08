import { useState } from "react";
import { FREE_ASSET_LIMIT, PLANS, startCheckout, type PlanTier } from "@/lib/plans";

const CHOICES: PlanTier[] = ["pro", "enterprise"];

export function UpgradeModal({
  open,
  reason,
  onClose,
}: {
  open: boolean;
  reason: string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<PlanTier>("pro");
  const [notice, setNotice] = useState<string | null>(null);

  if (!open) return null;

  const plan = PLANS[selected];

  const handleCheckout = async () => {
    const res = await startCheckout(selected);
    if (res.url) {
      window.location.href = res.url;
      return;
    }
    setNotice(res.message);
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
            {CHOICES.map((tier) => {
              const p = PLANS[tier];
              const active = selected === tier;
              return (
                <button
                  key={tier}
                  onClick={() => setSelected(tier)}
                  className={`rounded-lg border p-3 text-left transition ${
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
                    {tier === "enterprise" ? "Unlimited seats · multi-yard" : "Unlimited assets · 5 seats"}
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
              `Free accounts include ${FREE_ASSET_LIMIT} tracked assets. Card billing is not switched on yet — say the word and I'll connect secure checkout.`}
          </p>

          <button
            onClick={handleCheckout}
            className="mt-4 w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold uppercase tracking-widest text-primary-foreground"
          >
            Upgrade to {plan.name}
          </button>
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

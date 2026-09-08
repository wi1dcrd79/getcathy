import { FREE_ASSET_LIMIT, PRO_PRICE_LABEL } from "@/lib/certvault-data";

const FEATURES = [
  "Unlimited assets, bins and yard transfers",
  "One-click OSHA / client audit binder (PDF)",
  "Up to 5 crew seats with roles and permissions",
  "Full immutable location + inspection history",
  "Priority welder continuity alerts",
];

export function UpgradeModal({
  open,
  reason,
  onClose,
}: {
  open: boolean;
  reason: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="no-print fixed inset-0 z-[60] flex items-end justify-center bg-background/85 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md overflow-hidden rounded-t-2xl border border-primary/40 bg-surface sm:rounded-2xl">
        <div className="hazard-stripe h-1.5 w-full" />
        <div className="p-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
            Plan limit reached
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold uppercase leading-tight">
            Field Yard Pro
            <span className="ml-2 text-primary">{PRO_PRICE_LABEL}</span>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{reason}</p>

          <ul className="mt-4 space-y-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-success">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 rounded-md border border-border bg-input px-3 py-2 text-xs text-muted-foreground">
            Free accounts include {FREE_ASSET_LIMIT} tracked assets. Card billing is not switched on
            yet — say the word and I'll connect secure checkout.
          </p>

          <button
            disabled
            className="mt-4 w-full cursor-not-allowed rounded-lg bg-primary px-4 py-3 text-sm font-bold uppercase tracking-widest text-primary-foreground opacity-80"
          >
            Upgrade to Field Yard Pro
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

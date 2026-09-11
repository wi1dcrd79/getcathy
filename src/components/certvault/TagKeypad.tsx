import { useEffect, useMemo, useState } from "react";

export interface KeypadAsset {
  id: string;
  asset_tag: string;
  name: string;
  serial_or_vin?: string | null;
  current_location?: string | null;
  location?: string | null;
}

interface Props {
  open: boolean;
  assets: KeypadAsset[];
  onClose: () => void;
  onSelect: (asset: KeypadAsset) => void;
}

const KEYS_NUM = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const KEYS_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ-".split("");

/** 48px minimum touch target for gloved hands. */
const keyBase =
  "flex min-h-[56px] min-w-[48px] items-center justify-center rounded-lg border-2 border-border bg-input text-lg font-bold uppercase text-foreground active:bg-primary active:text-primary-foreground";

export function TagKeypad({ open, assets, onClose, onSelect }: Props) {
  const [entry, setEntry] = useState("");
  const [alpha, setAlpha] = useState(false);

  useEffect(() => {
    if (open) {
      setEntry("");
      setAlpha(false);
    }
  }, [open]);

  const matches = useMemo(() => {
    const q = entry.trim().toLowerCase();
    if (!q) return [];
    return assets
      .filter((a) => {
        const tag = a.asset_tag.toLowerCase();
        const serial = (a.serial_or_vin ?? "").toLowerCase();
        return tag.includes(q) || serial.includes(q) || tag.endsWith(q) || serial.endsWith(q);
      })
      .slice(0, 8);
  }, [assets, entry]);

  if (!open) return null;

  const press = (k: string) => setEntry((v) => (v.length >= 24 ? v : v + k));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/90 p-0 sm:items-center sm:p-4">
      <div className="panel max-h-[95vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-2 p-4 sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold uppercase tracking-widest">Manual Tag Entry</h2>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Last 4–6 of the tag or serial
            </p>
          </div>
          <button
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] rounded-lg border-2 border-border px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground"
          >
            Close
          </button>
        </div>

        <div className="mt-3 rounded-lg border-2 border-primary bg-input px-4 py-3 text-2xl font-bold tracking-[0.3em]">
          {entry || <span className="text-muted-foreground">····</span>}
        </div>

        {entry && (
          <div className="mt-3 space-y-2">
            {matches.length === 0 && (
              <p className="text-sm text-muted-foreground">No asset matches that yet.</p>
            )}
            {matches.map((a) => (
              <button
                key={a.id}
                onClick={() => onSelect(a)}
                className="flex min-h-[56px] w-full flex-col items-start justify-center rounded-lg border-2 border-border bg-surface px-4 py-2 text-left active:border-primary"
              >
                <span className="text-sm font-bold">{a.asset_tag}</span>
                <span className="text-xs text-muted-foreground">
                  {a.name}
                  {a.serial_or_vin ? ` · ${a.serial_or_vin}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          {(alpha ? KEYS_ALPHA : KEYS_NUM).map((k) => (
            <button key={k} onClick={() => press(k)} className={keyBase}>
              {k}
            </button>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2">
          <button onClick={() => setAlpha((a) => !a)} className={keyBase}>
            {alpha ? "123" : "ABC"}
          </button>
          <button onClick={() => setEntry((v) => v.slice(0, -1))} className={keyBase}>
            ⌫
          </button>
          <button onClick={() => setEntry("")} className={keyBase}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

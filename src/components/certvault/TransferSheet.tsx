import { useMemo, useState } from "react";
import { mockScanTag, transferAsset, type AssetRecord } from "@/lib/certvault-data";
import { buildBreadcrumb } from "@/lib/compliance";

const field =
  "w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary";
const label =
  "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground";

export function TransferSheet({
  open,
  assets,
  companyId,
  onClose,
  onMoved,
}: {
  open: boolean;
  assets: AssetRecord[];
  companyId: string | null;
  onClose: () => void;
  onMoved: () => void;
}) {
  const [assetId, setAssetId] = useState("");
  const [site, setSite] = useState("");
  const [zone, setZone] = useState("");
  const [bin, setBin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ from: string; to: string } | null>(null);

  const asset = useMemo(() => assets.find((a) => a.id === assetId) ?? null, [assets, assetId]);

  const sites = useMemo(
    () => Array.from(new Set(assets.map((a) => a.site).filter(Boolean))).sort(),
    [assets],
  );
  const zones = useMemo(
    () => Array.from(new Set(assets.map((a) => a.zone).filter(Boolean))).sort(),
    [assets],
  );
  const bins = useMemo(
    () => Array.from(new Set(assets.map((a) => a.bin).filter(Boolean))).sort(),
    [assets],
  );

  if (!open) return null;

  const scanAsset = () => {
    const tag = mockScanTag(assets.map((a) => a.asset_tag));
    const found = assets.find((a) => a.asset_tag === tag);
    if (found) {
      setAssetId(found.id);
      setDone(null);
    }
  };

  const confirm = async () => {
    if (!asset) return;
    setSaving(true);
    setError(null);
    try {
      const res = await transferAsset({ asset, site, zone, bin, companyId: companyId ?? "" });
      setDone(res);
      setAssetId("");
      setSite("");
      setZone("");
      setBin("");
      onMoved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move this asset.");
    } finally {
      setSaving(false);
    }
  };

  const preview = buildBreadcrumb(site, zone, bin);
  const ready = !!asset && !!preview && !saving;

  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full overflow-y-auto safe-bottom rounded-t-2xl border border-border bg-surface p-5 sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold uppercase">Quick Transfer</h2>
            <p className="text-xs text-muted-foreground">
              Scan the asset, pick the destination bin, confirm the move.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border px-2 py-1 text-xs uppercase text-muted-foreground"
          >
            Close
          </button>
        </div>

        {done && (
          <div className="mb-4 rounded-lg border border-success/40 bg-success/10 p-3 text-xs">
            <p className="font-semibold uppercase tracking-widest text-success">Move logged</p>
            <p className="mt-1 text-muted-foreground">
              {done.from} → <span className="text-foreground">{done.to}</span>
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={scanAsset}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-accent/50 bg-accent/5 px-4 py-6 text-accent"
        >
          <span className="text-2xl">≣</span>
          <span className="text-sm font-semibold uppercase tracking-widest">
            Scan asset barcode
          </span>
        </button>

        <div className="space-y-3">
          <div>
            <label className={label}>Asset</label>
            <select className={field} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">Select an asset…</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.asset_tag} — {a.name}
                </option>
              ))}
            </select>
          </div>

          {asset && (
            <p className="rounded-md border border-border bg-input px-3 py-2 text-xs text-muted-foreground">
              Currently at{" "}
              <span className="text-foreground">
                {asset.current_location || asset.location || "Unassigned"}
              </span>
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={label}>Site</label>
              <input
                className={field}
                list="tx-sites"
                value={site}
                onChange={(e) => setSite(e.target.value)}
              />
              <datalist id="tx-sites">
                {sites.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={label}>Zone</label>
              <input
                className={field}
                list="tx-zones"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
              />
              <datalist id="tx-zones">
                {zones.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={label}>Bin</label>
              <input
                className={field}
                list="tx-bins"
                value={bin}
                onChange={(e) => setBin(e.target.value)}
              />
              <datalist id="tx-bins">
                {bins.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>

          {preview && (
            <p className="tag-mono rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-primary">
              {preview}
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            onClick={confirm}
            disabled={!ready}
            className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-50"
          >
            {saving ? "Moving…" : "Confirm transfer"}
          </button>
        </div>
      </div>
    </div>
  );
}

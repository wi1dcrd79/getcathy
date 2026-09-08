import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { fetchAssets, transferAsset } from "@/lib/certvault-data";
import { buildBreadcrumb } from "@/lib/compliance";
import { BreadcrumbChips } from "@/components/certvault/Breadcrumb";
import { ScannerInput } from "@/components/certvault/ScannerInput";
import { enqueueTransfer, flushQueue, nextSequenceId, readQueue } from "@/lib/offline-queue";
import { toast } from "sonner";


export const Route = createFileRoute("/scan-transfer")({
  head: () => ({
    meta: [
      { title: "Yard Scanner — Scan-to-Transfer | C.A.T.H.Y." },
      {
        name: "description",
        content:
          "High-speed Telxon-style yard scanner: scan an asset, pick Site › Zone › Bin and confirm the move in one tap, online or offline.",
      },
      { property: "og:title", content: "Yard Scanner — Scan-to-Transfer | C.A.T.H.Y." },
      {
        property: "og:description",
        content: "Scan-to-transfer yard inventory with hardware scanner gun support and offline sync.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScanTransfer,
});

const label = "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground";
const field =
  "w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary";

function ScanTransfer() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const { companyId } = useProfile();
  const assetsQ = useQuery({ queryKey: ["assets"], queryFn: fetchAssets, enabled: !!session });
  const assets = assetsQ.data ?? [];

  const [gunMode, setGunMode] = useState(true);
  const [assetCode, setAssetCode] = useState("");
  const [assetId, setAssetId] = useState("");
  const [destCode, setDestCode] = useState("");
  const [site, setSite] = useState("");
  const [zone, setZone] = useState("");
  const [bin, setBin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const refreshQueue = () => readQueue().then((q) => setQueued(q.length));
    setOnline(navigator.onLine);
    refreshQueue();
    const goOnline = async () => {
      setOnline(true);
      const report = await flushQueue();
      await refreshQueue();
      if (report.applied > 0 || report.conflicts.length > 0) {
        assetsQ.refetch();
      }
      if (report.applied > 0) {
        toast.success(
          `Back online — ${report.applied} queued transfer${report.applied === 1 ? "" : "s"} synced.`,
        );
        setMsg(`Back online — ${report.applied} queued transfer${report.applied === 1 ? "" : "s"} synced.`);
      }
      for (const c of report.conflicts) {
        toast.warning(`Sync reconciliation — ${c.assetTag}`, {
          description: `Someone else moved it to ${c.actual} while you were offline. Your move to ${c.attempted} was logged as a conflict, not applied.`,
          duration: 12000,
        });
      }
      if (report.conflicts.length > 0) {
        setErr(
          `${report.conflicts.length} queued move${report.conflicts.length === 1 ? "" : "s"} conflicted with a newer move by another worker — logged for review.`,
        );
      }
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    if (navigator.onLine) goOnline();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const asset = useMemo(() => assets.find((a) => a.id === assetId) ?? null, [assets, assetId]);
  const uniq = (vals: string[]) => Array.from(new Set(vals.filter(Boolean))).sort();
  const sites = uniq(assets.map((a) => a.site));
  const zones = uniq(assets.map((a) => a.zone));
  const bins = uniq(assets.map((a) => a.bin));

  const matchAsset = (code: string) => {
    const c = code.trim().toLowerCase();
    const found = assets.find(
      (a) =>
        a.asset_tag.toLowerCase() === c ||
        (a.serial_or_vin ?? "").toLowerCase() === c ||
        a.asset_tag.toLowerCase().includes(c),
    );
    if (found) {
      setAssetId(found.id);
      setAssetCode(found.asset_tag);
      setErr(null);
    } else {
      setErr(`No asset matches "${code}".`);
    }
  };

  /** Secondary barcode: bin labels print as SITE|ZONE|BIN or SITE>ZONE>BIN. */
  const matchDestination = (code: string) => {
    const parts = code.split(/[|>]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      setSite(parts[0]!);
      setZone(parts[1]!);
      setBin(parts.slice(2).join(" "));
    } else {
      setBin(code.trim());
    }
    setDestCode(code.trim());
    setErr(null);
  };

  const to = buildBreadcrumb(site, zone, bin);
  const ready = !!asset && !!to && !busy;

  const confirm = async () => {
    if (!asset) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    const from = asset.current_location || asset.location || "Unassigned";
    const ts = new Date().toISOString();
    try {
      if (!navigator.onLine) throw new Error("OFFLINE");
      await transferAsset({ asset, site, zone, bin, companyId: companyId ?? "" });
      setMsg(`Moved ${asset.asset_tag}: ${from} → ${to}`);
      assetsQ.refetch();
    } catch (e) {
      const offline = !navigator.onLine || (e instanceof Error && e.message === "OFFLINE");
      if (offline) {
        const n = await enqueueTransfer({
          id: crypto.randomUUID(),
          asset_id: asset.id,
          asset_tag: asset.asset_tag,
          company_id: companyId ?? "",
          from_bin_id: from,
          to_bin_id: to,
          site,
          zone,
          bin,
          captured_at: ts,
          local_sequence_id: await nextSequenceId(),
        });
        setQueued(n);
        setMsg(`Offline — ${asset.asset_tag} → ${to} queued and will sync automatically.`);
        toast.info(`Queued offline — ${asset.asset_tag} → ${to}`);

      } else {
        setErr(e instanceof Error ? e.message : "Could not move this asset.");
        setBusy(false);
        return;
      }
    }
    setAssetId("");
    setAssetCode("");
    setDestCode("");
    setBusy(false);
  };

  return (
    <div className="min-h-screen pb-10">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="hazard-stripe h-1 w-full opacity-70" />
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold uppercase leading-none">Yard Scanner</h1>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Scan-to-Transfer · Site › Zone › Bin
            </p>
          </div>
          <Link
            to="/"
            className="rounded-md border border-border px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:border-primary"
          >
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <div className="panel flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold">Hardware Scanner Gun Mode</p>
            <p className="text-xs text-muted-foreground">
              Keeps the on-screen keyboard closed so a Bluetooth or laser gun can fire straight in.
            </p>
          </div>
          <button
            onClick={() => setGunMode((g) => !g)}
            className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-widest ${
              gunMode
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground"
            }`}
          >
            {gunMode ? "On" : "Off"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-widest">
          <span
            className={`rounded-full border px-3 py-1 ${
              online ? "border-success text-success" : "border-warning text-warning"
            }`}
          >
            {online ? "Online" : "Offline mode"}
          </span>
          {queued > 0 && (
            <span className="rounded-full border border-warning px-3 py-1 text-warning">
              {queued} queued
            </span>
          )}
        </div>

        <section className="panel space-y-3 p-4">
          <div>
            <span className={label}>1 · Scan asset tag or serial</span>
            <ScannerInput
              autoFocus
              gunMode={gunMode}
              captureWindow={!assetId}
              value={assetCode}
              placeholder="Fire scanner or type tag…"
              onChange={setAssetCode}
              onScan={matchAsset}
            />
          </div>
          <select
            value={assetId}
            onChange={(e) => {
              setAssetId(e.target.value);
              const a = assets.find((x) => x.id === e.target.value);
              setAssetCode(a?.asset_tag ?? "");
            }}
            className={field}
          >
            <option value="">— or pick from inventory —</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.asset_tag} · {a.name}
              </option>
            ))}
          </select>
          {asset && (
            <div className="rounded-md border border-border bg-input p-3">
              <p className="text-sm font-semibold">{asset.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">Currently at</p>
              <BreadcrumbChips value={asset.current_location || asset.location || "Unassigned"} />
            </div>
          )}
        </section>

        <section className="panel space-y-3 p-4">
          <div>
            <span className={label}>2 · Scan destination bin label</span>
            <ScannerInput
              gunMode={gunMode}
              captureWindow={!!assetId}
              value={destCode}
              placeholder="YARD A|BAY 2|BIN 14"
              onChange={setDestCode}
              onScan={matchDestination}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className={label}>Site</span>
              <input list="sites" value={site} onChange={(e) => setSite(e.target.value)} className={field} />
              <datalist id="sites">{sites.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
              <span className={label}>Zone</span>
              <input list="zones" value={zone} onChange={(e) => setZone(e.target.value)} className={field} />
              <datalist id="zones">{zones.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
              <span className={label}>Bin</span>
              <input list="bins" value={bin} onChange={(e) => setBin(e.target.value)} className={field} />
              <datalist id="bins">{bins.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
          </div>
          {to && (
            <div>
              <p className={label}>Destination</p>
              <BreadcrumbChips value={to} />
            </div>
          )}
        </section>

        {err && <p className="text-sm text-destructive">{err}</p>}
        {msg && <p className="text-sm text-success">{msg}</p>}

        <button
          disabled={!ready}
          onClick={confirm}
          className="w-full rounded-lg bg-accent px-4 py-4 text-sm font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-40"
        >
          {busy ? "Moving…" : "Confirm Transfer"}
        </button>
      </main>
    </div>
  );
}

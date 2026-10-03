import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { QueuedSignature } from "@/lib/signatures/offline-queue";
import {
  conflictKind,
  normalizeExisting,
  type ConflictKind,
  type ExistingSignature,
} from "@/lib/signatures/conflict";

const COPY: Record<ConflictKind, { headline: string; body: string }> = {
  other_same: {
    headline: "Someone else signed first",
    body:
      "They signed the same version you reviewed. " + "Your signature isn't needed. Discard it.",
  },
  other_different: {
    headline: "Signed, but a different version",
    body:
      "The signature on record is not for the version you reviewed. " +
      "Check the signed record before discarding. " +
      "A correction needs a new version of the record.",
  },
  own_same: {
    headline: "Your signature is already recorded",
    body: "It went through earlier. " + "This copy on your device is a leftover. Discard it.",
  },
  own_different: {
    headline: "You already signed a different version",
    body:
      "A signature from your account is on record, but for different content. " +
      "The record is frozen. A correction needs a new version.",
  },
  unknown: {
    headline: "Already signed",
    body:
      "This record was signed, but the details didn't come through. " +
      "Connect to load them, or keep this on your device until you can.",
  },
};

const when = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : "Unknown";
};
const role = (r: string) => r.replace(/_/g, " ");

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </>
  );
}

interface Props {
  item: QueuedSignature;
  online: boolean;
  onDiscard: () => void;
  onClose: () => void;
}

/** Review an "already signed" conflict: discard the device copy or keep it. */
export function ConflictRecoveryScreen({ item, online, onDiscard, onClose }: Props) {
  const stored = normalizeExisting(item.existing);
  const hasStored = stored !== null;
  const [live, setLive] = useState<ExistingSignature | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hasStored || !online) return;
    let alive = true;
    setLoading(true);
    void supabase
      .from("signatures")
      .select("id, signer_id, signer_role, synced_at, content_sha256")
      .eq(item.target as "inspection_id", item.target_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setLoading(false);
        if (!data) return;
        setLive(
          normalizeExisting({
            signature_id: data.id,
            signer_role: data.signer_role,
            synced_at: data.synced_at,
            signed_by_me: data.signer_id === item.signer_id,
            content_sha256_matches: data.content_sha256 === item.content_sha256,
          }),
        );
      });
    return () => {
      alive = false;
    };
  }, [hasStored, online, item.target, item.target_id, item.signer_id, item.content_sha256]);

  const ex = stored ?? live;
  const kind = conflictKind(ex);
  const copy = COPY[kind];
  const card = "rounded-lg border border-border bg-card p-4";
  const grid = "mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm";
  const btn = "min-h-12 rounded-md px-5 text-sm font-bold uppercase tracking-widest";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Resolve conflict: ${item.label}`}
      className="fixed inset-0 z-50 overflow-y-auto bg-background"
    >
      <div className="safe-top safe-bottom mx-auto max-w-xl space-y-4 px-4 py-5">
        <h2 className="text-xl font-bold uppercase">{copy.headline}</h2>
        <p className="text-base">{copy.body}</p>
        {loading && <p className="text-sm text-muted-foreground">Loading details...</p>}
        {kind === "unknown" && !online && (
          <p className="text-sm text-muted-foreground">You're offline.</p>
        )}

        <section className={card}>
          <h3 className="text-sm font-bold uppercase tracking-widest">Your signature</h3>
          <dl className={grid}>
            <Row k="Record" v={item.label} />
            <Row k="Signed on device" v={when(item.offline_created_at)} />
            <Row k="Attempts" v={String(item.attempts ?? 0)} />
            <Row k="Fingerprint" v={item.content_sha256.slice(0, 12)} />
          </dl>
        </section>

        <section className={card}>
          <h3 className="text-sm font-bold uppercase tracking-widest">Signature on record</h3>
          {ex ? (
            <dl className={grid}>
              <Row k="Signed by" v={ex.signed_by_me ? "You" : role(ex.signer_role)} />
              <Row k="Role" v={role(ex.signer_role)} />
              <Row k="Received" v={when(ex.synced_at)} />
              <Row k="Same version you reviewed" v={ex.content_sha256_matches ? "Yes" : "No"} />
            </dl>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Details unavailable.</p>
          )}
        </section>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={onDiscard}
            className={`${btn} bg-accent text-accent-foreground`}
          >
            Discard my signature
          </button>
          <button type="button" onClick={onClose} className={`${btn} border border-border`}>
            Keep on device
          </button>
        </div>
      </div>
    </div>
  );
}

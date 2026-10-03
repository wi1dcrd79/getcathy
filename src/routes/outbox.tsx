import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import {
  SignatureCaptureDialog,
  type RecordKind,
} from "@/components/signatures/SignatureCaptureDialog";
import {
  dismissSignature,
  isRetryable,
  readSignatureQueue,
  type QueuedSignature,
} from "@/lib/signatures/offline-queue";
import {
  flushSignatureQueue,
  resignItem,
  retrySignature,
  TABLE_BY_TARGET,
} from "@/lib/signatures/sign-record";
import { hashRecord } from "@/lib/signatures/signed-fields";
import { ConflictRecoveryScreen } from "@/components/signatures/ConflictRecoveryScreen";

export const Route = createFileRoute("/outbox")({
  head: () => ({
    meta: [
      { title: "Signature Outbox | C.A.T.H.Y." },
      {
        name: "description",
        content: "Signatures saved on this device, waiting to sync or needing attention.",
      },
      { property: "og:title", content: "Signature Outbox | C.A.T.H.Y." },
      {
        property: "og:description",
        content: "Review queued, failed and conflicting offline signatures.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Outbox,
});

type Filter = "pending" | "attention" | "conflicts";

const KIND: Record<string, RecordKind> = {
  inspection_id: "Inspection",
  risk_assessment_id: "JHA / Risk Assessment",
  cert_verification_id: "Personnel Cert",
  incident_report_id: "Inspection",
};

function bucket(x: QueuedSignature): Filter {
  if (x.status === "conflict") return "conflicts";
  if (x.status === "queued" || x.status === "syncing") return "pending";
  return "attention";
}

function Outbox() {
  const { user, loading } = useAuth();
  const { role } = useProfile();
  const queryClient = useQueryClient();
  const [all, setAll] = useState<QueuedSignature[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [online, setOnline] = useState(true);
  const [resign, setResign] = useState<{
    item: QueuedSignature;
    row: Record<string, unknown>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<QueuedSignature | null>(null);

  useEffect(() => {
    const refresh = () => void readSignatureQueue().then(setAll);
    const net = () => setOnline(navigator.onLine);
    refresh();
    net();
    window.addEventListener("cathy:signature-queue", refresh);
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    return () => {
      window.removeEventListener("cathy:signature-queue", refresh);
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
    };
  }, []);

  const mine = useMemo(
    () => all.filter((x) => x.signer_id && x.signer_id === user?.id),
    [all, user],
  );
  const others = all.filter((x) => x.signer_id && x.signer_id !== user?.id).length;
  const legacy = all.filter((x) => !x.signer_id);
  const counts = { pending: 0, attention: 0, conflicts: 0 } as Record<Filter, number>;
  for (const x of mine) counts[bucket(x)] += 1;
  counts.attention += legacy.length;
  const shown = [
    ...mine.filter((x) => bucket(x) === filter),
    ...(filter === "attention" ? legacy : []),
  ];

  const report = useCallback(
    async (r: Awaited<ReturnType<typeof flushSignatureQueue>> | null) => {
      if (!r) return;
      if (r.signed) toast.success(`${r.signed} signature${r.signed > 1 ? "s" : ""} submitted`);
      for (const x of r.rejected) toast.error(`${x.label}: ${x.message}`);
      if (r.pending) toast.message("Still can't reach the server — kept in the outbox.");
      await queryClient.invalidateQueries({ queryKey: ["signatures"] });
    },
    [queryClient],
  );

  async function retryAll() {
    for (const x of mine.filter(isRetryable)) await retrySignature(x.local_id);
    await report(await flushSignatureQueue());
  }

  async function startResign(item: QueuedSignature) {
    const table = TABLE_BY_TARGET[item.target];
    if (!table) {
      toast.error("This record type can't be re-signed here.");
      return;
    }
    const { data, error } = await supabase
      .from(table as "inspections")
      .select("*")
      .eq("id", item.target_id)
      .maybeSingle();
    if (error || !data) {
      toast.error("Couldn't load the current record. Try again online.");
      return;
    }
    setResign({ item, row: data as unknown as Record<string, unknown> });
  }

  async function confirmResign(png: string) {
    if (!resign) return;
    setBusy(true);
    try {
      const out = await resignItem(resign.item.local_id, resign.row, png);
      if (out.kind === "signed") toast.success(`Signed: ${resign.item.label}`);
      else if (out.kind === "queued")
        toast.message("Saved on this device — will submit on reconnect.");
      else toast.error(out.message);
      await queryClient.invalidateQueries({ queryKey: ["signatures"] });
      setResign(null);
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(x: QueuedSignature, reason?: string): Promise<boolean> {
    if (!user) return false;
    if (
      !window.confirm(
        `Discard "${x.label}" from this device? The drawn signature image will be deleted. A record that it was discarded is kept.`,
      )
    )
      return false;
    await dismissSignature(x.local_id, user.id, reason);
    return true;
  }

  if (!loading && !user) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10 text-center">
        <p className="text-lg font-semibold">Sign in to see your signature outbox.</p>
        <Link
          to="/auth"
          className="mt-4 inline-flex min-h-12 items-center rounded-md bg-accent px-5 font-bold uppercase tracking-widest text-accent-foreground"
        >
          Sign in
        </Link>
      </main>
    );
  }

  const chips: Array<[Filter, string]> = [
    ["pending", "Pending"],
    ["attention", "Needs attention"],
    ["conflicts", "Conflicts"],
  ];

  return (
    <div className="min-h-screen">
      <header className="safe-top sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-xl font-bold uppercase">Signature outbox</h1>
          <Link
            to="/"
            className="inline-flex min-h-12 items-center rounded-md border border-border px-4 text-sm font-semibold uppercase tracking-widest"
          >
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {!online && (
          <p className="rounded-md border border-warning px-4 py-3 text-base font-semibold text-warning">
            You're offline. Items will sync when you reconnect.
          </p>
        )}
        {others > 0 && (
          <p className="rounded-md border border-border px-4 py-3 text-base text-muted-foreground">
            {others} signature{others > 1 ? "s" : ""} belong{others === 1 ? "s" : ""} to another
            user on this device.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {chips.map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className={`min-h-12 rounded-full border px-4 text-sm font-bold uppercase tracking-widest ${filter === k ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}
            >
              {l} · {counts[k]}
            </button>
          ))}
        </div>

        {mine.some(isRetryable) && (
          <button
            type="button"
            disabled={!online}
            onClick={() => void retryAll()}
            className="min-h-12 w-full rounded-md bg-accent text-base font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-50"
          >
            {online ? "Retry all" : "Retry all — go online first"}
          </button>
        )}

        {shown.length === 0 && (
          <p className="py-10 text-center text-lg text-muted-foreground">Nothing here.</p>
        )}

        {shown.map((x) => (
          <OutboxCard
            key={x.local_id}
            item={x}
            online={online}
            onRetry={async () => report(await retrySignature(x.local_id))}
            onResign={() => void startResign(x)}
            onReview={() => setReview(x)}
            onDismiss={() => void dismiss(x)}
          />
        ))}
      </main>

      {resign && (
        <SignatureCaptureDialog
          recordKind={KIND[resign.item.target] ?? "Inspection"}
          label={resign.item.label}
          role={role}
          computeHash={() => hashRecord(TABLE_BY_TARGET[resign.item.target]!, resign.row)}
          busy={busy}
          onConfirm={(png) => void confirmResign(png)}
          onCancel={() => setResign(null)}
        />
      )}

      {review && (
        <ConflictRecoveryScreen
          item={review}
          online={online}
          onDiscard={(reason) =>
            void dismiss(review, reason).then((done) => done && setReview(null))
          }
          onClose={() => setReview(null)}
        />
      )}
    </div>
  );
}

function OutboxCard({
  item,
  online,
  onRetry,
  onResign,
  onDismiss,
  onReview,
}: {
  item: QueuedSignature;
  online: boolean;
  onRetry: () => void;
  onResign: () => void;
  onDismiss: () => void;
  onReview: () => void;
}) {
  const [winner, setWinner] = useState<{ signer_role: string; synced_at: string } | null>(null);

  useEffect(() => {
    if (item.status !== "conflict" || !online) return;
    void supabase
      .from("signatures")
      .select("signer_role, synced_at")
      .eq(item.target as "inspection_id", item.target_id)
      .maybeSingle()
      .then(({ data }) => setWinner(data ?? null));
  }, [item, online]);

  const statusLabel: Record<string, string> = {
    queued: "Waiting to sync",
    syncing: "Syncing…",
    failed: "Failed",
    conflict: "Already signed",
    needs_resign: "Needs re-sign",
  };
  const bad =
    item.status === "failed" || item.status === "conflict" || item.status === "needs_resign";
  const hashMismatch = item.status === "failed" && item.error_status === 400;
  const canResign = (hashMismatch || item.status === "needs_resign") && !!item.signer_id;

  return (
    <article className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">{item.label}</p>
          <p className="text-sm text-muted-foreground">{KIND[item.target] ?? "Record"}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-widest ${bad ? "border-destructive text-destructive" : "border-accent text-accent"}`}
        >
          {statusLabel[item.status ?? "queued"]}
        </span>
      </div>
      <p className="text-base">
        Signed on device at {new Date(item.offline_created_at).toLocaleString()}
      </p>
      {(item.attempts ?? 0) > 0 && (
        <p className="text-sm text-muted-foreground">
          {item.attempts} attempt{item.attempts === 1 ? "" : "s"}
          {item.last_attempt_at && ` · last ${new Date(item.last_attempt_at).toLocaleString()}`}
        </p>
      )}
      {item.status === "needs_resign" && (
        <p className="text-base text-destructive">
          Saved by an older version of the app without a signer — it won't be submitted. Dismiss it
          and sign again.
        </p>
      )}
      {item.error && bad && <p className="text-base text-destructive">{item.error}</p>}
      {item.status === "conflict" && winner && (
        <p className="text-base">
          Signed by {winner.signer_role.replace(/_/g, " ")} at{" "}
          {new Date(winner.synced_at).toLocaleString()}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {isRetryable(item) && (
          <button
            type="button"
            disabled={!online}
            onClick={onRetry}
            className="min-h-12 rounded-md bg-accent px-5 text-sm font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-50"
          >
            Retry
          </button>
        )}
        {canResign && (
          <button
            type="button"
            disabled={!online}
            onClick={onResign}
            className="min-h-12 rounded-md bg-accent px-5 text-sm font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-50"
          >
            Re-sign
          </button>
        )}
        {item.status === "conflict" && (
          <button
            type="button"
            onClick={onReview}
            className="min-h-12 rounded-md bg-accent px-5 text-sm font-bold uppercase tracking-widest text-accent-foreground"
          >
            Review
          </button>
        )}
        {bad && (
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-12 rounded-md border border-border px-5 text-sm font-bold uppercase tracking-widest"
          >
            Dismiss
          </button>
        )}
      </div>
      {!online && (isRetryable(item) || canResign) && (
        <p className="text-sm text-muted-foreground">Go online to retry or re-sign.</p>
      )}
    </article>
  );
}

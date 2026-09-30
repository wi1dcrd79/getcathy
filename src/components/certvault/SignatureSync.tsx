import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { dismissSignature, readSignatureQueue, type QueuedSignature } from "@/lib/signatures/offline-queue";
import { flushSignatureQueue } from "@/lib/signatures/sign-record";

/** Flushes queued signatures on reconnect / on demand and shows outbox status. */
export function SignatureSync() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<QueuedSignature[]>([]);
  const [open, setOpen] = useState(false);
  const running = useRef(false);

  useEffect(() => {
    const refresh = () => void readSignatureQueue().then(setItems);
    refresh();
    window.addEventListener("cathy:signature-queue", refresh);
    return () => window.removeEventListener("cathy:signature-queue", refresh);
  }, []);

  const flush = useCallback(async () => {
    if (running.current || !navigator.onLine || !session) return;
    running.current = true;
    try {
      const r = await flushSignatureQueue();
      if (r.signed) toast.success(`${r.signed} queued signature${r.signed > 1 ? "s" : ""} submitted`);
      for (const x of r.rejected) toast.error(`${x.label}: ${x.message}`);
      if (r.signed || r.rejected.length) await queryClient.invalidateQueries({ queryKey: ["signatures"] });
    } finally {
      running.current = false;
    }
  }, [session, queryClient]);

  useEffect(() => {
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  if (items.length === 0) return null;
  const pending = items.filter((x) => x.status === "queued" || x.status === "syncing").length;
  const problems = items.length - pending;

  return (
    <div className="no-print safe-bottom fixed bottom-4 left-4 z-40 max-w-sm">
      {open && (
        <div className="mb-2 space-y-2 rounded-md border border-border bg-card p-3 text-xs">
          {items.map((x) => (
            <div key={x.local_id} className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{x.label}</p>
                <p className={x.status === "conflict" || x.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                  {x.status === "conflict" ? "Already signed by someone else" : x.status === "failed" ? x.error ?? "Rejected" : x.status === "syncing" ? "Syncing…" : `Queued ${new Date(x.offline_created_at).toLocaleString()}`}
                </p>
              </div>
              {(x.status === "conflict" || x.status === "failed") && (
                <button type="button" onClick={() => void dismissSignature(x.local_id)} className="min-h-12 rounded border border-border px-3 font-semibold uppercase">
                  Dismiss
                </button>
              )}
            </div>
          ))}
          {pending > 0 && (
            <button type="button" onClick={() => void flush()} className="min-h-12 w-full rounded-md bg-accent font-bold uppercase tracking-widest text-accent-foreground">
              Sync now
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`min-h-12 rounded-full border bg-card px-4 text-xs font-bold uppercase tracking-widest ${problems ? "border-destructive text-destructive" : "border-accent text-accent"}`}
      >
        {pending > 0 && `${pending} signature${pending > 1 ? "s" : ""} waiting to sync`}
        {pending > 0 && problems > 0 && " · "}
        {problems > 0 && `${problems} need attention`}
      </button>
    </div>
  );
}

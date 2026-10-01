import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { readSignatureQueue, type QueuedSignature } from "@/lib/signatures/offline-queue";
import { flushSignatureQueue } from "@/lib/signatures/sign-record";

/** Flushes the current user's queued signatures on reconnect and links to /outbox. */
export function SignatureSync() {
  const { session, user } = useAuth();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<QueuedSignature[]>([]);
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
      if (r.signed)
        toast.success(`${r.signed} queued signature${r.signed > 1 ? "s" : ""} submitted`);
      for (const x of r.rejected) toast.error(`${x.label}: ${x.message}`);
      if (r.signed || r.rejected.length)
        await queryClient.invalidateQueries({ queryKey: ["signatures"] });
    } finally {
      running.current = false;
    }
  }, [session, queryClient]);

  useEffect(() => {
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  const mine = items.filter((x) => x.signer_id && x.signer_id === user?.id);
  if (!user || mine.length === 0) return null;
  const pending = mine.filter((x) => x.status === "queued" || x.status === "syncing").length;
  const problems = mine.length - pending;

  return (
    <div className="no-print safe-bottom fixed bottom-4 left-4 z-40 max-w-sm">
      <Link
        to="/outbox"
        className={`inline-flex min-h-12 items-center rounded-full border bg-card px-4 text-xs font-bold uppercase tracking-widest ${problems ? "border-destructive text-destructive" : "border-accent text-accent"}`}
      >
        {pending > 0 && `${pending} signature${pending > 1 ? "s" : ""} waiting to sync`}
        {pending > 0 && problems > 0 && " · "}
        {problems > 0 && `${problems} need attention`}
      </Link>
    </div>
  );
}

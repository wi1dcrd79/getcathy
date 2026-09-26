import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { readSignatureQueue } from "@/lib/signatures/offline-queue";
import { flushSignatureQueue } from "@/lib/signatures/sign-record";

/** Flushes queued signatures on reconnect and shows a pending-count chip. */
export function SignatureSync() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = () => void readSignatureQueue().then((q) => setPending(q.length));
    refresh();
    window.addEventListener("cathy:signature-queue", refresh);
    return () => window.removeEventListener("cathy:signature-queue", refresh);
  }, []);

  useEffect(() => {
    if (!session) return;
    let running = false;
    const flush = async () => {
      if (running || !navigator.onLine) return;
      running = true;
      try {
        const r = await flushSignatureQueue();
        if (r.signed) toast.success(`${r.signed} queued signature${r.signed > 1 ? "s" : ""} submitted`);
        for (const x of r.rejected) toast.error(`${x.label}: ${x.message}`);
        if (r.signed || r.rejected.length) await queryClient.invalidateQueries({ queryKey: ["signatures"] });
      } finally {
        running = false;
      }
    };
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [session, queryClient]);

  if (pending === 0) return null;
  return (
    <div className="no-print safe-bottom fixed bottom-4 left-4 z-40 rounded-full border border-accent bg-card px-4 py-3 text-xs font-bold uppercase tracking-widest text-accent">
      {pending} signature{pending > 1 ? "s" : ""} waiting to sync
    </div>
  );
}

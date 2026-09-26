import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { hashRecord, type SignableTable } from "@/lib/signatures/signed-fields";

export interface SignatureVerificationRow {
  signer_id: string;
  signer_role: string;
  signed_at: string | null;
  offline_created_at: string | null;
  synced_at: string;
  content_sha256: string;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Read-only verification panel for a signed record: signer, role, time, hash check. */
export function SignatureVerification({
  table,
  row,
  sig,
}: {
  table: SignableTable;
  row: Record<string, unknown>;
  sig: SignatureVerificationRow;
}) {
  const [hashState, setHashState] = useState<"checking" | "match" | "mismatch">("checking");

  const signer = useQuery({
    queryKey: ["signer-profile", sig.signer_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", sig.signer_id)
        .maybeSingle();
      return data?.email ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    let cancelled = false;
    hashRecord(table, row).then((h) => {
      if (!cancelled) setHashState(h === sig.content_sha256 ? "match" : "mismatch");
    });
    return () => {
      cancelled = true;
    };
  }, [table, row, sig.content_sha256]);

  const signedWhen = sig.signed_at ?? sig.offline_created_at ?? sig.synced_at;

  return (
    <div className="mt-2 w-full rounded-md border border-border bg-card p-3 text-left text-xs">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Signature verification
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-muted-foreground">Signer</dt>
        <dd className="font-medium text-foreground">{signer.data ?? sig.signer_id.slice(0, 8) + "…"}</dd>
        <dt className="text-muted-foreground">Authorized role</dt>
        <dd className="font-medium text-foreground">{sig.signer_role.replace(/_/g, " ")}</dd>
        <dt className="text-muted-foreground">Signed at</dt>
        <dd className="font-medium text-foreground">
          {formatWhen(signedWhen)}
          {sig.offline_created_at && " (captured offline)"}
        </dd>
        <dt className="text-muted-foreground">Content hash</dt>
        <dd className="break-all font-mono text-[10px] text-foreground">{sig.content_sha256}</dd>
        <dt className="text-muted-foreground">Integrity</dt>
        <dd>
          {hashState === "checking" && (
            <span className="text-muted-foreground">Recomputing…</span>
          )}
          {hashState === "match" && (
            <span className="inline-flex items-center gap-1 font-bold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified — record unchanged since signing
            </span>
          )}
          {hashState === "mismatch" && (
            <span className="inline-flex items-center gap-1 font-bold text-destructive">
              <ShieldAlert className="h-3.5 w-3.5" /> Mismatch — record changed after signing
            </span>
          )}
        </dd>
      </dl>
    </div>
  );
}

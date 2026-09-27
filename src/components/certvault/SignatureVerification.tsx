import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, FileDown } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { hashRecord, pickSignedColumns, SIGNED_COLUMNS, type SignableTable } from "@/lib/signatures/signed-fields";
import { getSignerIdentity } from "@/lib/signatures/submit-signature.functions";

const TABLE_LABEL: Record<SignableTable, string> = {
  incident_reports: "Incident report",
  inspections: "Inspection",
  risk_assessments: "Risk assessment",
  personnel_certs: "Personnel certification",
};

export interface SignatureVerificationRow {
  id: string;
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
  label,
}: {
  table: SignableTable;
  row: Record<string, unknown>;
  sig: SignatureVerificationRow;
  label: string;
}) {
  // NOTE: hashState is display-only feedback. The real integrity enforcement
  // happened server-side at signing time (hash re-verification + freeze
  // triggers). Never wire logic or gates off this client-side result.
  const [hashState, setHashState] = useState<"checking" | "match" | "mismatch">("checking");

  // profiles RLS only exposes the caller's own row (or admin-tier), so the
  // signer email is resolved server-side after a same-company check.
  const fetchSigner = useServerFn(getSignerIdentity);
  const signer = useQuery({
    queryKey: ["signer-profile", sig.id],
    queryFn: () => fetchSigner({ data: { signature_id: sig.id } }),
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
  const [exporting, setExporting] = useState(false);

  async function exportEvidence() {
    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const margin = 56;
      const width = doc.internal.pageSize.getWidth() - margin * 2;
      let y = margin;

      const line = (text: string, opts?: { bold?: boolean; size?: number; gap?: number }) => {
        doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
        doc.setFontSize(opts?.size ?? 10);
        const wrapped = doc.splitTextToSize(text, width) as string[];
        for (const w of wrapped) {
          if (y > doc.internal.pageSize.getHeight() - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(w, margin, y);
          y += (opts?.size ?? 10) * 1.4;
        }
        y += opts?.gap ?? 2;
      };

      doc.setFillColor(20, 24, 31);
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), 72, "F");
      doc.setTextColor(245, 158, 11);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("C.A.T.H.Y. — Signature Evidence Report", margin, 40);
      doc.setTextColor(20, 24, 31);
      y = 100;

      line(`Record: ${TABLE_LABEL[table]} — ${label}`, { bold: true, size: 12, gap: 8 });
      line(`Generated: ${formatWhen(new Date().toISOString())}`, { gap: 12 });

      line("Signature", { bold: true, size: 11, gap: 4 });
      line(`Signer: ${signer.data?.email ?? sig.signer_id}`);
      line(`Authorized role: ${sig.signer_role.replace(/_/g, " ")}`);
      line(`Signed at: ${formatWhen(signedWhen)}${sig.offline_created_at ? " (captured offline)" : ""}`);
      line(`Synced at: ${formatWhen(sig.synced_at)}`, { gap: 12 });

      line("Sealed content hash (SHA-256, RFC 8785 canonical)", { bold: true, size: 11, gap: 4 });
      doc.setFont("courier", "normal");
      line(sig.content_sha256, { gap: 12 });

      line("Verification result", { bold: true, size: 11, gap: 4 });
      line(
        hashState === "match"
          ? "VERIFIED — the record's current content reproduces the sealed hash; it is unchanged since signing."
          : hashState === "mismatch"
            ? "MISMATCH — the record's current content does not reproduce the sealed hash; it changed after signing."
            : "Hash recomputation was still in progress at export time.",
        { gap: 12 },
      );

      line("Signed record content (as sealed)", { bold: true, size: 11, gap: 4 });
      const sealed = pickSignedColumns(row, SIGNED_COLUMNS[table]);
      for (const [k, v] of Object.entries(sealed)) {
        const val = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "—");
        line(`${k}: ${val}`);
      }

      y += 16;
      line(
        "This report is a point-in-time export of a signature record. Integrity enforcement is performed " +
          "server-side at signing time (hash re-verification and record freeze). The verification result above " +
          "is a recomputation for evidence purposes.",
        { size: 8, gap: 0 },
      );

      doc.save(`signature-evidence-${sig.id.slice(0, 8)}.pdf`);
      toast.success("Evidence report downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mt-2 w-full rounded-md border border-border bg-card p-3 text-left text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Signature verification
        </p>
        <button
          type="button"
          onClick={exportEvidence}
          disabled={exporting || hashState === "checking"}
          className="no-print inline-flex min-h-8 items-center gap-1 rounded border border-border px-2 text-[10px] font-bold uppercase tracking-widest text-foreground disabled:opacity-50"
        >
          <FileDown className="h-3.5 w-3.5" />
          {exporting ? "Exporting…" : "Export evidence"}
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-muted-foreground">Signer</dt>
        <dd className="font-medium text-foreground">{signer.data?.email ?? sig.signer_id.slice(0, 8) + "…"}</dd>
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

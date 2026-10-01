import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { SignatureCaptureDialog, type RecordKind } from "@/components/signatures/SignatureCaptureDialog";
import { SignatureVerification, type SignatureVerificationRow } from "./SignatureVerification";
import { signRecord } from "@/lib/signatures/sign-record";
import { canSign, hashRecord, type SignableTable } from "@/lib/signatures/signed-fields";

interface SignatureRow extends SignatureVerificationRow {
  id: string;
  inspection_id: string | null;
  risk_assessment_id: string | null;
  cert_verification_id: string | null;
}

const COLUMN: Record<SignableTable, keyof SignatureRow> = {
  incident_reports: "incident_report_id" as keyof SignatureRow,
  inspections: "inspection_id",
  risk_assessments: "risk_assessment_id",
  personnel_certs: "cert_verification_id",
};

const KIND: Record<SignableTable, RecordKind> = {
  incident_reports: "Inspection",
  inspections: "Inspection",
  risk_assessments: "JHA / Risk Assessment",
  personnel_certs: "Personnel Cert",
};

export function useCompanySignatures() {
  return useQuery({
    queryKey: ["signatures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signatures")
        .select("id, inspection_id, risk_assessment_id, cert_verification_id, signer_id, signer_role, signed_at, offline_created_at, synced_at, content_sha256");
      if (error) throw error;
      return (data ?? []) as SignatureRow[];
    },
  });
}

/** Sign-off control: shows "Signed & frozen" stamp, or a Sign button for authorized roles. */
export function SignOff({
  table,
  row,
  label,
}: {
  table: SignableTable;
  row: Record<string, unknown>;
  label: string;
}) {
  const { role, isSuperAdmin, companyId } = useProfile();
  const sigs = useCompanySignatures();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);
  const [showVerify, setShowVerify] = useState(false);

  const computeHash = useCallback(() => hashRecord(table, row), [table, row]);
  const id = String(row["id"]);
  const sig = sigs.data?.find((s) => s[COLUMN[table]] === id);

  if (sig) {
    const when = new Date(sig.signed_at ?? sig.synced_at).toLocaleDateString();
    return (
      <span className="inline-flex flex-col items-start">
        <button
          type="button"
          onClick={() => setShowVerify((v) => !v)}
          className="inline-flex min-h-8 items-center rounded border border-primary px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-primary"
          title="Show signature verification details"
        >
          Signed & frozen · {sig.signer_role.replace(/_/g, " ")} · {when}
        </button>
        {showVerify && <SignatureVerification table={table} row={row} sig={sig} label={label} />}
      </span>
    );
  }
  if (queued) {
    return (
      <span className="inline-flex items-center rounded border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Signature queued offline
      </span>
    );
  }
  if (!canSign(role) || isSuperAdmin || !companyId) return null;

  async function onConfirm(png: string) {
    setBusy(true);
    try {
      const out = await signRecord({ table, row, companyId: companyId!, label, pngBase64: png });
      if (out.kind === "signed") {
        toast.success(`Signed: ${label}`);
        await queryClient.invalidateQueries({ queryKey: ["signatures"] });
      } else if (out.kind === "queued") {
        setQueued(true);
        toast.message("You're offline — signature saved on this device and will submit on reconnect.");
      } else {
        toast.error(out.message);
        await queryClient.invalidateQueries({ queryKey: ["signatures"] });
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Signature failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-print min-h-12 rounded-md bg-accent px-3 text-xs font-bold uppercase tracking-widest text-accent-foreground"
      >
        Sign off
      </button>
      {open && (
        <SignatureCaptureDialog
          recordKind={KIND[table]}
          label={label}
          role={role}
          computeHash={computeHash}
          busy={busy}
          onConfirm={onConfirm}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}

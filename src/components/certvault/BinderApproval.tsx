import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { SignatureCaptureDialog } from "@/components/signatures/SignatureCaptureDialog";
import { compileAuditBinder } from "@/lib/audit-binder.functions";
import { submitSignature } from "@/lib/signatures/submit-signature.functions";
import { canSign } from "@/lib/signatures/signed-fields";

interface Binder {
  id: string;
  version: number;
  status: string;
  content_sha256: string | null;
  compiled_at: string | null;
}

/** Binder-level approval: separate from per-inspection sign-offs; signing flips the whole binder to "signed". */
export function BinderApproval() {
  const { role, isSuperAdmin, companyId, readOnly } = useProfile();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["audit-binder-latest", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_binders")
        .select("id, version, status, content_sha256, compiled_at")
        .eq("company_id", companyId!)
        .order("version", { ascending: false })
        .limit(1);
      if (error) throw error;
      const b = (data?.[0] ?? null) as Binder | null;
      let sig: { signer_role: string; synced_at: string } | null = null;
      if (b) {
        const { data: s } = await supabase
          .from("signatures")
          .select("signer_role, synced_at")
          .eq("audit_binder_id", b.id)
          .maybeSingle();
        sig = s;
      }
      return { b, sig };
    },
  });

  const canCompile =
    !isSuperAdmin && ["company_admin", "safety_director", "qc_inspector"].includes(role);
  const b = q.data?.b;
  const sig = q.data?.sig;

  async function compile() {
    setBusy(true);
    try {
      const r = await compileAuditBinder();
      toast.success(`Binder v${r.version} compiled and sealed.`);
      await qc.invalidateQueries({ queryKey: ["audit-binder-latest", companyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not compile binder");
    } finally {
      setBusy(false);
    }
  }

  async function approve(png: string) {
    if (!b?.content_sha256 || !companyId) return;
    setBusy(true);
    try {
      const res = await submitSignature({
        data: {
          company_id: companyId,
          audit_binder_id: b.id,
          content_sha256: b.content_sha256,
          signature_png_base64: png,
          signed_at: new Date().toISOString(),
          device_metadata: { user_agent: navigator.userAgent, kind: "binder_approval" },
        },
      });
      if (res.ok) toast.success(`Binder v${b.version} approved.`);
      else toast.error(res.message);
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["audit-binder-latest", companyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  }

  const tone =
    b?.status === "signed"
      ? "border-success text-success"
      : b?.status === "compiled"
        ? "border-warning text-warning"
        : "border-border text-muted-foreground";

  return (
    <section className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
      <div className="text-sm">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Binder approval
        </p>
        {b ? (
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-semibold">Version {b.version}</span>
            <span
              className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${tone}`}
            >
              {b.status}
            </span>
            {sig && (
              <span className="text-xs text-muted-foreground">
                Approved by {sig.signer_role.replace(/_/g, " ")} ·{" "}
                {new Date(sig.synced_at).toLocaleString()}
              </span>
            )}
            {b.content_sha256 && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {b.content_sha256.slice(0, 16)}…
              </span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-muted-foreground">No binder compiled yet.</p>
        )}
      </div>
      <div className="flex gap-2">
        {canCompile && b?.status !== "compiled" && (
          <button
            type="button"
            disabled={busy || readOnly}
            onClick={compile}
            className="min-h-12 rounded-md border border-border px-3 text-xs font-bold uppercase tracking-widest hover:border-primary disabled:opacity-50"
          >
            {b ? "Compile new version" : "Compile binder"}
          </button>
        )}
        {b?.status === "compiled" && canSign(role) && !isSuperAdmin && (
          <button
            type="button"
            disabled={busy || readOnly}
            onClick={() => setOpen(true)}
            className="min-h-12 rounded-md bg-accent px-3 text-xs font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-50"
          >
            Approve binder
          </button>
        )}
      </div>
      {open && b && (
        <SignatureCaptureDialog
          recordKind="Audit Binder"
          label={`Audit binder v${b.version}`}
          role={role}
          computeHash={async () => b.content_sha256 ?? Promise.reject(new Error("no hash"))}
          busy={busy}
          onConfirm={approve}
          onCancel={() => setOpen(false)}
        />
      )}
    </section>
  );
}

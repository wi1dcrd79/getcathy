import { useEffect, useState } from "react";
import { SignaturePad } from "./SignaturePad";

export type RecordKind = "Audit Binder" | "Inspection" | "JHA / Risk Assessment" | "Personnel Cert";

interface Props {
  recordKind: RecordKind;
  label: string;
  /** Role snapshot for display; the server re-reads and stamps the authoritative role. */
  role: string;
  /** Computes the RFC 8785 content_sha256 (via canonicalize.ts) shown before signing. */
  computeHash: () => Promise<string>;
  busy?: boolean;
  onConfirm: (pngBase64: string) => void;
  onCancel: () => void;
}

export function SignatureCaptureDialog({
  recordKind,
  label,
  role,
  computeHash,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const [hash, setHash] = useState<string | null>(null);
  const [hashErr, setHashErr] = useState(false);

  useEffect(() => {
    let live = true;
    computeHash()
      .then((h) => live && setHash(h))
      .catch(() => live && setHashErr(true));
    return () => {
      live = false;
    };
  }, [computeHash]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Sign ${label}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur sm:items-center"
    >
      <div className="safe-bottom max-h-[95vh] w-full max-w-xl overflow-y-auto rounded-t-xl border border-border bg-card p-4 sm:rounded-xl">
        <h2 className="text-base font-bold uppercase tracking-wide">Sign off</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Record type</dt>
          <dd className="font-semibold">{recordKind}</dd>
          <dt className="text-muted-foreground">Record</dt>
          <dd className="font-semibold">{label}</dd>
          <dt className="text-muted-foreground">Signing as</dt>
          <dd className="font-semibold uppercase tracking-wide">{role.replace(/_/g, " ")}</dd>
          <dt className="text-muted-foreground">Fingerprint</dt>
          <dd className="break-all font-mono text-[10px]">
            {hashErr ? "Could not compute" : (hash ?? "Computing…")}
          </dd>
        </dl>
        <p className="mt-3 rounded-md border border-warning px-3 py-2 text-xs font-semibold text-warning">
          Single signature, final. Once signed, this record is permanently frozen — any correction
          requires a new version.
        </p>
        <SignaturePad busy={busy || !hash} onConfirm={onConfirm} onCancel={onCancel} />
      </div>
    </div>
  );
}

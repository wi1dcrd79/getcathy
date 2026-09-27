import { submitSignature } from "./submit-signature.functions";
import { hashRecord, type SignableTable } from "./signed-fields";
import {
  enqueueSignature,
  readSignatureQueue,
  writeSignatureQueue,
  type QueuedSignature,
  type SignatureTarget,
} from "./offline-queue";

const TARGET_BY_TABLE: Record<SignableTable, SignatureTarget> = {
  incident_reports: "incident_report_id" as SignatureTarget,
  inspections: "inspection_id",
  risk_assessments: "risk_assessment_id",
  personnel_certs: "cert_verification_id",
};

export type SignOutcome =
  | { kind: "signed" }
  | { kind: "queued" }
  | { kind: "rejected"; status: number; message: string };

function deviceMetadata() {
  return {
    user_agent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    platform: navigator.platform,
    online: navigator.onLine,
  };
}

async function send(item: QueuedSignature): Promise<SignOutcome | "network"> {
  try {
    const res = await submitSignature({
      data: {
        company_id: item.company_id,
        [item.target]: item.target_id,
        content_sha256: item.content_sha256,
        signature_png_base64: item.signature_png_base64,
        offline_created_at: item.offline_created_at,
        signed_at: item.signed_at,
        device_metadata: item.device_metadata,
      },
    });
    if (res.ok) return { kind: "signed" };
    return { kind: "rejected", status: res.status, message: res.message };
  } catch (e) {
    if (!navigator.onLine) return "network";
    const msg = e instanceof Error ? e.message : "Signature failed";
    // Network-ish failures stay queued; everything else surfaces.
    if (/fetch|network|Failed to fetch|timeout/i.test(msg)) return "network";
    return { kind: "rejected", status: 500, message: msg };
  }
}

/**
 * Snapshot the record's signed fields, hash with RFC 8785, then submit —
 * or queue on-device if offline so the exact snapshot is what gets verified.
 */
export async function signRecord(args: {
  table: SignableTable;
  row: Record<string, unknown>;
  companyId: string;
  label: string;
  pngBase64: string;
}): Promise<SignOutcome> {
  const now = new Date().toISOString();
  const item: QueuedSignature = {
    local_id: crypto.randomUUID(),
    company_id: args.companyId,
    target: TARGET_BY_TABLE[args.table],
    target_id: String(args.row["id"]),
    label: args.label,
    content_sha256: await hashRecord(args.table, args.row),
    signature_png_base64: args.pngBase64,
    offline_created_at: now,
    signed_at: now,
    device_metadata: deviceMetadata(),
  };

  if (!navigator.onLine) {
    await enqueueSignature(item);
    return { kind: "queued" };
  }
  const out = await send(item);
  if (out === "network") {
    await enqueueSignature(item);
    return { kind: "queued" };
  }
  return out;
}

export interface SignatureFlushReport {
  signed: number;
  rejected: Array<{ label: string; message: string }>;
  pending: number;
}

/** Submit queued signatures in capture order. Rejections are dropped and reported. */
export async function flushSignatureQueue(): Promise<SignatureFlushReport> {
  const q = await readSignatureQueue();
  const report: SignatureFlushReport = { signed: 0, rejected: [], pending: 0 };
  if (q.length === 0) return report;
  const remaining: QueuedSignature[] = [];
  const ordered = [...q].sort((a, b) => a.offline_created_at.localeCompare(b.offline_created_at));
  for (const item of ordered) {
    const out = await send(item);
    if (out === "network") remaining.push(item);
    else if (out.kind === "signed") report.signed += 1;
    else if (out.kind === "rejected") {
      const message =
        out.status === 409
          ? "Someone else signed this record first."
          : out.status === 400
            ? "The record changed after you signed it — review and sign again."
            : out.message;
      report.rejected.push({ label: item.label, message });
    }
  }
  report.pending = remaining.length;
  await writeSignatureQueue(remaining);
  window.dispatchEvent(new Event("cathy:signature-queue"));
  return report;
}

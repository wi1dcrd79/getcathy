import { get, set } from "idb-keyval";

const KEY = "cathy.signature-outbox.v1";

export type SignatureTarget = "inspection_id" | "risk_assessment_id" | "cert_verification_id" | "incident_report_id" | "incident_report_resolution_id";

/** "needs_resign" = legacy item with no recorded signer; never auto-submitted. */
export type OutboxStatus = "queued" | "syncing" | "conflict" | "failed" | "needs_resign";

export interface QueuedSignature {
  local_id: string;
  company_id: string;
  /** Auth user who captured the signature. Only that user's session may submit it. */
  signer_id?: string;
  target: SignatureTarget;
  target_id: string;
  label: string;
  content_sha256: string;
  signature_png_base64: string;
  /** Display-only; server timestamps decide authoritative order. */
  offline_created_at: string;
  signed_at: string;
  device_metadata: Record<string, unknown>;
  status?: OutboxStatus;
  error?: string;
  /** HTTP status from the last server rejection; undefined = network/unknown. */
  error_status?: number;
  attempts?: number;
  last_attempt_at?: string;
}

export async function readSignatureQueue(): Promise<QueuedSignature[]> {
  try {
    const q = ((await get(KEY)) as QueuedSignature[] | undefined) ?? [];
    return q.map((x) => ({
      ...x,
      attempts: x.attempts ?? 0,
      status: !x.signer_id ? "needs_resign" : (x.status ?? "queued"),
    }));
  } catch {
    return [];
  }
}

export async function writeSignatureQueue(items: QueuedSignature[]) {
  try {
    await set(KEY, items);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event("cathy:signature-queue"));
}

/**
 * Add a capture. If a queued/syncing item already exists for the same target,
 * that one is kept and returned. A conflict/failed/needs_resign item for the
 * target is replaced by the new capture (never a silent no-op).
 */
export async function enqueueSignature(item: QueuedSignature): Promise<QueuedSignature> {
  const q = await readSignatureQueue();
  const same = (x: QueuedSignature) => x.target === item.target && x.target_id === item.target_id && x.signer_id === item.signer_id;
  const active = q.find((x) => same(x) && (x.status === "queued" || x.status === "syncing"));
  if (active) return active;
  const fresh: QueuedSignature = { ...item, status: "queued", attempts: 0, error: undefined, error_status: undefined };
  await writeSignatureQueue([...q.filter((x) => !same(x)), fresh]);
  return fresh;
}

/** Remove an item (and its stored image data). Only the capturing user may dismiss. */
export async function dismissSignature(localId: string, currentUserId: string) {
  const q = await readSignatureQueue();
  await writeSignatureQueue(q.filter((x) => !(x.local_id === localId && (x.signer_id === currentUserId || !x.signer_id))));
}

/** Blind retry is only safe for server errors (>=500) or network/unknown failures — never 400/403/409. */
export function isRetryable(x: QueuedSignature) {
  return x.status === "failed" && (x.error_status === undefined || x.error_status >= 500);
}

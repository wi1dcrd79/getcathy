import { get, set } from "idb-keyval";

const KEY = "cathy.signature-outbox.v1";

export type SignatureTarget = "inspection_id" | "risk_assessment_id" | "cert_verification_id" | "incident_report_id" | "incident_report_resolution_id";

export type OutboxStatus = "queued" | "syncing" | "conflict" | "failed";

export interface QueuedSignature {
  local_id: string;
  company_id: string;
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
}

export async function readSignatureQueue(): Promise<QueuedSignature[]> {
  try {
    const q = ((await get(KEY)) as QueuedSignature[] | undefined) ?? [];
    return q.map((x) => ({ ...x, status: x.status ?? "queued" }));
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

export async function enqueueSignature(item: QueuedSignature) {
  const q = await readSignatureQueue();
  if (!q.some((x) => x.target === item.target && x.target_id === item.target_id)) q.push({ ...item, status: "queued" });
  await writeSignatureQueue(q);
  return q.length;
}

/** Remove a conflict/failed item after the user has acknowledged it. */
export async function dismissSignature(localId: string) {
  const q = await readSignatureQueue();
  await writeSignatureQueue(q.filter((x) => x.local_id !== localId));
}

import { get, set } from "idb-keyval";

const KEY = "cathy.signature-outbox.v1";

export type SignatureTarget = "inspection_id" | "risk_assessment_id" | "cert_verification_id" | "incident_report_id" | "incident_report_resolution_id";

export interface QueuedSignature {
  local_id: string;
  company_id: string;
  target: SignatureTarget;
  target_id: string;
  label: string;
  content_sha256: string;
  signature_png_base64: string;
  offline_created_at: string;
  signed_at: string;
  device_metadata: Record<string, unknown>;
}

export async function readSignatureQueue(): Promise<QueuedSignature[]> {
  try {
    return ((await get(KEY)) as QueuedSignature[] | undefined) ?? [];
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
}

export async function enqueueSignature(item: QueuedSignature) {
  const q = await readSignatureQueue();
  if (!q.some((x) => x.target === item.target && x.target_id === item.target_id)) q.push(item);
  await writeSignatureQueue(q);
  window.dispatchEvent(new Event("cathy:signature-queue"));
  return q.length;
}

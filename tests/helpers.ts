import { set } from "idb-keyval";
import type { QueuedSignature } from "@/lib/signatures/offline-queue";

export const KEY = "cathy.signature-outbox.v1";

let online = true;
Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
export const setOnline = (v: boolean) => {
  online = v;
};

export const makeItem = (o: Partial<QueuedSignature> = {}): QueuedSignature => ({
  local_id: crypto.randomUUID(),
  company_id: "co-1",
  signer_id: "user-a",
  target: "inspection_id",
  target_id: crypto.randomUUID(),
  label: "Item",
  content_sha256: "a".repeat(64),
  signature_png_base64: "iVBORw0KGgo=",
  offline_created_at: "2026-10-01T10:00:00.000Z",
  signed_at: "2026-10-01T10:00:00.000Z",
  device_metadata: {},
  status: "queued",
  ...o,
});

export const seed = (items: QueuedSignature[]) => set(KEY, items);
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

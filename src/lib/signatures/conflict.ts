/**
 * Strict validation of server rejection bodies. Rule: never act on a guess —
 * anything not fully valid is treated as "no information".
 */
import type { QueuedSignature } from "./offline-queue";

export type ExistingSignature = NonNullable<QueuedSignature["existing"]>;
export type ConflictKind = "own_same" | "own_different" | "other_same" | "other_different" | "unknown";

const DEFAULTS: Record<string, string> = {
  ALREADY_SIGNED: "This record has already been signed.",
  BINDER_NOT_SIGNABLE: "This binder can't be signed right now.",
};
const GENERIC = "The server rejected this signature.";

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

export function normalizeExisting(raw: unknown): ExistingSignature | null {
  if (!isObj(raw)) return null;
  const { signature_id, signer_role, synced_at, signed_by_me, content_sha256_matches } = raw;
  if (!nonEmpty(signature_id) || !nonEmpty(signer_role) || !nonEmpty(synced_at)) return null;
  if (Number.isNaN(Date.parse(synced_at))) return null;
  if (typeof signed_by_me !== "boolean" || typeof content_sha256_matches !== "boolean") return null;
  return { signature_id, signer_role, synced_at, signed_by_me, content_sha256_matches };
}

export function conflictKind(e: ExistingSignature | null | undefined): ConflictKind {
  if (!e) return "unknown";
  return `${e.signed_by_me ? "own" : "other"}_${e.content_sha256_matches ? "same" : "different"}`;
}

export interface NormalizedRejection {
  status: number;
  message: string;
  code: string | undefined;
  binder_status: string | undefined;
  existing: ExistingSignature | null;
}

export function normalizeRejection(raw: unknown): NormalizedRejection {
  const r = isObj(raw) ? raw : {};
  const code = nonEmpty(r["code"]) ? (r["code"] as string) : undefined;
  const known = code !== undefined && code in DEFAULTS;
  const s = r["status"];
  const status =
    known ? 409 : typeof s === "number" && Number.isInteger(s) && s >= 100 && s <= 599 ? s : 500;
  const message = nonEmpty(r["message"])
    ? (r["message"] as string)
    : ((code && DEFAULTS[code]) ?? GENERIC);
  return {
    status,
    message,
    code,
    binder_status:
      code === "BINDER_NOT_SIGNABLE" && typeof r["binder_status"] === "string"
        ? (r["binder_status"] as string)
        : undefined,
    existing: code === "ALREADY_SIGNED" ? normalizeExisting(r["existing"]) : null,
  };
}

/** First-signer conflict: explicit code, or legacy (no code) 409 with the old message. */
export function isFirstSignerConflict(n: NormalizedRejection): boolean {
  if (n.code) return n.code === "ALREADY_SIGNED";
  return n.status === 409 && /already been signed/i.test(n.message);
}

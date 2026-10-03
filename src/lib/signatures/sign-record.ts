import { supabase } from "@/integrations/supabase/client";
import { submitSignature } from "./submit-signature.functions";
import { hashRecord, type SignableTable } from "./signed-fields";
import { conflictKind, isFirstSignerConflict, normalizeRejection } from "./conflict";
import {
  enqueueSignature,
  isRetryable,
  readAllSignatures,
  writeSignatureQueue,
  type QueuedSignature,
  type SignatureTarget,
} from "./offline-queue";

export const TARGET_BY_TABLE: Record<SignableTable, SignatureTarget> = {
  incident_reports: "incident_report_id" as SignatureTarget,
  inspections: "inspection_id",
  risk_assessments: "risk_assessment_id",
  personnel_certs: "cert_verification_id",
};

export const TABLE_BY_TARGET: Partial<Record<SignatureTarget, SignableTable>> = {
  inspection_id: "inspections",
  risk_assessment_id: "risk_assessments",
  cert_verification_id: "personnel_certs",
  incident_report_id: "incident_reports",
};

export type SignOutcome =
  | { kind: "signed" }
  | { kind: "queued" }
  | {
      kind: "rejected";
      status: number;
      message: string;
      code?: string | undefined;
      existing?: QueuedSignature["existing"];
    };

type SendResult = SignOutcome | { kind: "network"; message?: string };

function deviceMetadata() {
  return {
    user_agent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    platform: navigator.platform,
    online: navigator.onLine,
  };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function send(item: QueuedSignature): Promise<SendResult> {
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
    if (res && (res as { ok?: unknown }).ok === true) return { kind: "signed" };
    const n = normalizeRejection(res);
    // Lost response: our own signature over the same content already landed.
    // Strict: only a fully valid block with real booleans may auto-clear.
    if (n.code === "ALREADY_SIGNED" && conflictKind(n.existing) === "own_same")
      return { kind: "signed" };
    return {
      kind: "rejected",
      status: n.status,
      message: n.message,
      code: n.code,
      existing: n.existing,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Signature failed";
    if (!navigator.onLine || /fetch|network|timeout/i.test(msg))
      return { kind: "network", message: msg };
    // Unexpected server error (e.g. storage upload failure) — safe to retry.
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
  const signerId = await currentUserId();
  if (!signerId) return { kind: "rejected", status: 401, message: "Sign in again before signing." };
  const now = new Date().toISOString();
  const item: QueuedSignature = {
    local_id: crypto.randomUUID(),
    company_id: args.companyId,
    signer_id: signerId,
    target: TARGET_BY_TABLE[args.table],
    target_id: String(args.row["id"]),
    label: args.label,
    content_sha256: await hashRecord(args.table, args.row),
    signature_png_base64: args.pngBase64,
    offline_created_at: now,
    signed_at: now,
    device_metadata: deviceMetadata(),
    attempts: 0,
  };

  if (!navigator.onLine) {
    await enqueueSignature(item);
    return { kind: "queued" };
  }
  const out = await send(item);
  if (out.kind === "network") {
    await enqueueSignature(item);
    return { kind: "queued" };
  }
  if (out.kind === "rejected") {
    // Drop any stale outbox entry for this record that a new capture supersedes.
    if (out.status === 409) await clearTarget(item);
  } else {
    await clearTarget(item);
  }
  return out;
}

async function clearTarget(item: QueuedSignature) {
  const q = await readAllSignatures();
  const next = q.filter(
    (x) =>
      x.status === "discarded" ||
      !(
        x.target === item.target &&
        x.target_id === item.target_id &&
        x.signer_id === item.signer_id
      ),
  );
  if (next.length !== q.length) await writeSignatureQueue(next);
}

export interface SignatureFlushReport {
  signed: number;
  rejected: Array<{ label: string; message: string }>;
  pending: number;
}

/**
 * Submit the CURRENT user's queued signatures in capture order. Items captured
 * by another account on this device are never submitted. 200 → removed;
 * rejections keep the server's status + message; network errors stay queued.
 */
export async function flushSignatureQueue(onlyLocalId?: string): Promise<SignatureFlushReport> {
  const report: SignatureFlushReport = { signed: 0, rejected: [], pending: 0 };
  const uid = await currentUserId();
  if (!uid) return report;
  const q = await readAllSignatures();
  const todo = q.filter(
    (x) =>
      x.signer_id === uid &&
      (x.status === "queued" || x.status === "syncing") &&
      (!onlyLocalId || x.local_id === onlyLocalId),
  );
  if (todo.length === 0) return report;
  const byId = new Map(q.map((x) => [x.local_id, x]));
  for (const x of todo) byId.set(x.local_id, { ...x, status: "syncing" });
  await writeSignatureQueue([...byId.values()]);

  const ordered = [...todo].sort((a, b) =>
    a.offline_created_at.localeCompare(b.offline_created_at),
  );
  for (const item of ordered) {
    const tried = {
      ...item,
      attempts: (item.attempts ?? 0) + 1,
      last_attempt_at: new Date().toISOString(),
    };
    const out = await send(item);
    if (out.kind === "network") {
      byId.set(item.local_id, {
        ...tried,
        status: "queued",
        error: out.message,
        error_status: undefined,
      });
      report.pending += 1;
    } else if (out.kind === "signed") {
      byId.delete(item.local_id);
      report.signed += 1;
    } else if (out.kind === "rejected") {
      const firstSigner = isFirstSignerConflict({
        status: out.status,
        message: out.message,
        code: out.code,
        binder_status: undefined,
        existing: out.existing ?? null,
      });
      byId.set(item.local_id, {
        ...tried,
        status: firstSigner ? "conflict" : "failed",
        error: out.message,
        error_status: out.status,
        error_code: out.code,
        existing: out.existing,
      });
      report.rejected.push({ label: item.label, message: out.message });
    }
  }
  await writeSignatureQueue([...byId.values()]);
  return report;
}

/** Re-queue and submit one failed item. Only for 5xx / network failures. */
export async function retrySignature(localId: string): Promise<SignatureFlushReport | null> {
  const uid = await currentUserId();
  const q = await readAllSignatures();
  const item = q.find((x) => x.local_id === localId);
  if (!item || item.signer_id !== uid || !isRetryable(item)) return null;
  await writeSignatureQueue(
    q.map((x) => (x.local_id === localId ? { ...x, status: "queued" } : x)),
  );
  return flushSignatureQueue(localId);
}

/** Replace a stale item (e.g. 400 hash mismatch) with a fresh capture of the current record. */
export async function resignItem(
  localId: string,
  row: Record<string, unknown>,
  pngBase64: string,
): Promise<SignOutcome> {
  const q = await readAllSignatures();
  const old = q.find((x) => x.local_id === localId);
  const table = old ? TABLE_BY_TARGET[old.target] : undefined;
  if (!old || !table)
    return { kind: "rejected", status: 400, message: "This record type can't be re-signed here." };
  await writeSignatureQueue(q.filter((x) => x.local_id !== localId));
  return signRecord({ table, row, companyId: old.company_id, label: old.label, pngBase64 });
}

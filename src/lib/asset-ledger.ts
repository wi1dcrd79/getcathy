import { get, set } from "idb-keyval";
import { syncLedgerBatch } from "@/lib/asset-ledger.functions";

const KEY = "cathy.ledger-outbox.v1";
const TAIL_KEY = "cathy.ledger-tails.v1";

export type LedgerActionType = "CHECKOUT" | "CHECKIN" | "TRANSFER";

export interface LedgerAction {
  id: string;
  company_id: string;
  asset_id: string;
  action_type: LedgerActionType;
  expected_prior_event_id: string | null;
  metadata: Record<string, unknown>;
  captured_at: string;
}

export interface LedgerSyncReport {
  applied: number;
  conflicts: Array<{ assetId: string; actionType: LedgerActionType }>;
  failed: number;
}

async function readOutbox(): Promise<LedgerAction[]> {
  try {
    return ((await get(KEY)) as LedgerAction[] | undefined) ?? [];
  } catch {
    return [];
  }
}

async function writeOutbox(items: LedgerAction[]) {
  try {
    await set(KEY, items);
  } catch {
    /* storage unavailable */
  }
}

async function readTails(): Promise<Record<string, string>> {
  try {
    return ((await get(TAIL_KEY)) as Record<string, string> | undefined) ?? {};
  } catch {
    return {};
  }
}

/**
 * Enqueue an offline field action. The UUID is minted on the device at capture
 * time, and the action chains against the last action this device queued for
 * the same asset (or the asset's last known server event when the chain is
 * empty), so a whole offline shift replays in true order.
 */
export async function enqueueLedgerAction(input: {
  company_id: string;
  asset_id: string;
  action_type: LedgerActionType;
  metadata?: Record<string, unknown>;
  /** Asset's current_ledger_event_id as last seen from the server. */
  current_ledger_event_id?: string | null;
}): Promise<LedgerAction> {
  const tails = await readTails();
  const expected = tails[input.asset_id] ?? input.current_ledger_event_id ?? null;
  const action: LedgerAction = {
    id: crypto.randomUUID(),
    company_id: input.company_id,
    asset_id: input.asset_id,
    action_type: input.action_type,
    expected_prior_event_id: expected,
    metadata: input.metadata ?? {},
    captured_at: new Date().toISOString(),
  };
  const q = await readOutbox();
  q.push(action);
  await writeOutbox(q);
  tails[input.asset_id] = action.id;
  try {
    await set(TAIL_KEY, tails);
  } catch {
    /* storage unavailable */
  }
  return action;
}

export async function readLedgerOutbox(): Promise<LedgerAction[]> {
  return readOutbox();
}

/** Push the outbox to the server in capture order; conflicting items are dropped for review. */
export async function flushLedgerOutbox(): Promise<LedgerSyncReport> {
  const q = await readOutbox();
  const report: LedgerSyncReport = { applied: 0, conflicts: [], failed: 0 };
  if (q.length === 0) return report;

  const ordered = [...q].sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  try {
    const res = await syncLedgerBatch({ data: { actions: ordered } });
    report.applied = res.applied;
    report.conflicts = res.conflicts.map((c) => ({ assetId: c.asset_id, actionType: c.action_type }));
    report.failed = res.failed;
    // Keep only actions the server reported as failed (retryable); applied and
    // conflicted actions are durably recorded server-side already.
    const failedIds = new Set(res.failed_ids);
    const remaining = ordered.filter((a) => failedIds.has(a.id));
    await writeOutbox(remaining);
    if (remaining.length === 0) {
      try {
        await set(TAIL_KEY, {});
      } catch {
        /* ignore */
      }
    }
  } catch {
    report.failed = ordered.length;
  }
  return report;
}

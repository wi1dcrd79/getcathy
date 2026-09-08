import { get, set } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";

const KEY = "certvault.transfer-queue.v2";
const SEQ_KEY = "certvault.transfer-seq.v1";

export interface QueuedTransfer {
  id: string;
  asset_id: string;
  asset_tag: string;
  company_id: string;
  /** Location the device believed the asset was in when scanned. */
  from_bin_id: string;
  to_bin_id: string;
  site: string;
  zone: string;
  bin: string;
  /** ISO timestamp of the physical scan on the device. */
  captured_at: string;
  /** Monotonic per-device counter so replays keep their true field order. */
  local_sequence_id: number;
}

export type SyncOutcome =
  | { kind: "applied"; item: QueuedTransfer }
  | { kind: "conflict"; item: QueuedTransfer; actualLocation: string }
  | { kind: "failed"; item: QueuedTransfer };

export interface SyncReport {
  applied: number;
  conflicts: Array<{ assetTag: string; attempted: string; actual: string }>;
  failed: number;
}

export async function nextSequenceId(): Promise<number> {
  try {
    const current = ((await get(SEQ_KEY)) as number | undefined) ?? 0;
    const next = current + 1;
    await set(SEQ_KEY, next);
    return next;
  } catch {
    return Date.now();
  }
}

export async function readQueue(): Promise<QueuedTransfer[]> {
  try {
    return ((await get(KEY)) as QueuedTransfer[] | undefined) ?? [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedTransfer[]) {
  try {
    await set(KEY, items);
  } catch {
    /* storage unavailable — nothing else we can do */
  }
}

export async function enqueueTransfer(item: QueuedTransfer) {
  const q = await readQueue();
  q.push(item);
  await writeQueue(q);
  return q.length;
}

async function logMove(item: QueuedTransfer, syncStatus: "offline_sync" | "conflict") {
  const { error } = await supabase.from("location_history").insert({
    asset_id: item.asset_id,
    asset_tag: item.asset_tag,
    moved_from: item.from_bin_id,
    moved_to: item.to_bin_id,
    company_id: item.company_id,
    created_at: item.captured_at,
    captured_at: item.captured_at,
    expected_from: item.from_bin_id,
    local_sequence_id: String(item.local_sequence_id),
    sync_status: syncStatus,
  } as never);
  return !error;
}

/**
 * Chain-of-custody push. The device clock never wins by itself: the move is only
 * applied when the asset is still where the scanner believed it was. If another
 * worker moved it while we were offline the move is appended to the immutable
 * location_history flagged as a conflict and the current location is left alone.
 */
async function pushOne(item: QueuedTransfer): Promise<SyncOutcome> {
  const { data: asset, error } = await supabase
    .from("assets")
    .select("id, current_location, location")
    .eq("id", item.asset_id)
    .maybeSingle();
  if (error || !asset) return { kind: "failed", item };

  const serverLocation =
    (asset as { current_location?: string; location?: string }).current_location ||
    (asset as { location?: string }).location ||
    "Unassigned";

  const expected = item.from_bin_id || "Unassigned";

  if (serverLocation !== expected && serverLocation !== item.to_bin_id) {
    const ok = await logMove(item, "conflict");
    return ok
      ? { kind: "conflict", item, actualLocation: serverLocation }
      : { kind: "failed", item };
  }

  const { error: updErr } = await supabase
    .from("assets")
    .update({
      site: item.site,
      zone: item.zone,
      bin: item.bin,
      current_location: item.to_bin_id,
      location: item.to_bin_id,
    } as never)
    .eq("id", item.asset_id);
  if (updErr) return { kind: "failed", item };

  const ok = await logMove(item, "offline_sync");
  return ok ? { kind: "applied", item } : { kind: "failed", item };
}

/** Push every queued transfer in true field order. */
export async function flushQueue(): Promise<SyncReport> {
  const q = await readQueue();
  const report: SyncReport = { applied: 0, conflicts: [], failed: 0 };
  if (q.length === 0) return report;

  const ordered = [...q].sort(
    (a, b) =>
      a.captured_at.localeCompare(b.captured_at) || a.local_sequence_id - b.local_sequence_id,
  );

  const remaining: QueuedTransfer[] = [];
  for (const item of ordered) {
    const res = await pushOne(item);
    if (res.kind === "applied") report.applied += 1;
    else if (res.kind === "conflict") {
      report.conflicts.push({
        assetTag: item.asset_tag,
        attempted: item.to_bin_id,
        actual: res.actualLocation,
      });
    } else {
      report.failed += 1;
      remaining.push(item);
    }
  }
  await writeQueue(remaining);
  return report;
}

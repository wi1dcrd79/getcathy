import { get, set } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";

const KEY = "certvault.transfer-queue.v1";

export interface QueuedTransfer {
  id: string;
  assetId: string;
  assetTag: string;
  companyId: string;
  from: string;
  to: string;
  site: string;
  zone: string;
  bin: string;
  /** ISO timestamp used for last-write-wins conflict resolution. */
  ts: string;
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

async function pushOne(item: QueuedTransfer): Promise<boolean> {
  // Last-write-wins: skip if the server already recorded a newer move.
  const { data: newer } = await supabase
    .from("location_history")
    .select("created_at")
    .eq("asset_id", item.assetId)
    .gt("created_at", item.ts)
    .limit(1);
  if (newer && newer.length > 0) return true; // superseded — drop it

  const { error: updErr } = await supabase
    .from("assets")
    .update({
      site: item.site,
      zone: item.zone,
      bin: item.bin,
      current_location: item.to,
      location: item.to,
    } as never)
    .eq("id", item.assetId);
  if (updErr) return false;

  const { error: histErr } = await supabase.from("location_history").insert({
    asset_id: item.assetId,
    asset_tag: item.assetTag,
    moved_from: item.from,
    moved_to: item.to,
    company_id: item.companyId,
    created_at: item.ts,
  } as never);
  return !histErr;
}

/** Push every queued transfer. Returns how many synced. */
export async function flushQueue(): Promise<number> {
  const q = await readQueue();
  if (q.length === 0) return 0;

  // Last-write-wins per asset: only the newest queued move per asset matters.
  const newestPerAsset = new Map<string, QueuedTransfer>();
  for (const item of [...q].sort((a, b) => a.ts.localeCompare(b.ts))) {
    newestPerAsset.set(item.assetId, item);
  }

  const remaining: QueuedTransfer[] = [];
  let synced = 0;
  for (const item of newestPerAsset.values()) {
    const ok = await pushOne(item);
    if (ok) synced += 1;
    else remaining.push(item);
  }
  await writeQueue(remaining);
  return synced;
}

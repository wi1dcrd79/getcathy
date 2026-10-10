import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const actionSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  asset_id: z.string().uuid(),
  action_type: z.enum(["CHECKOUT", "CHECKIN", "TRANSFER"]),
  expected_prior_event_id: z.string().uuid().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  captured_at: z.string(),
});

const batchSchema = z.object({
  actions: z.array(actionSchema).max(200),
});

interface ConflictRow {
  asset_id: string;
  action_type: "CHECKOUT" | "CHECKIN" | "TRANSFER";
}

/**
 * Atomic offline-batch sync. Items are processed strictly in capture order.
 * Every action is unconditionally appended to asset_ledger (append-only audit),
 * then the asset's state pointer is advanced only if it still matches the
 * action's expected prior event. A zero-row update means a race: the action is
 * filed to ledger_conflicts, and every downstream action in the same batch that
 * chained onto a conflicted event is cascaded into conflicts as well.
 */
export const syncLedgerBatch = createServerFn({ method: "POST" })
  .inputValidator((data) => batchSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();
    const companyId = profile?.company_id as string | undefined;
    if (!companyId) throw new Error("No company membership.");

    const applied: string[] = [];
    const conflicts: ConflictRow[] = [];
    const failedIds: string[] = [];
    // Event ids whose conditional update lost the race — downstream chained
    // actions must cascade into conflicts instead of writing on phantom state.
    const poisoned = new Set<string>();

    for (const action of data.actions) {
      if (action.company_id !== companyId) {
        failedIds.push(action.id);
        continue;
      }

      // Ownership check: the asset must belong to the caller's company
      // (RLS-scoped read) before anything — ledger row or conflict — is filed.
      const { data: owned } = await supabase
        .from("assets")
        .select("id")
        .eq("id", action.asset_id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!owned) {
        failedIds.push(action.id);
        continue;
      }

      // 1. Unconditional append-only ledger insert (idempotent on client UUID).
      const { error: ledgerErr } = await supabase.from("asset_ledger").upsert(
        {
          id: action.id,
          company_id: companyId,
          asset_id: action.asset_id,
          actor_id: userId,
          action_type: action.action_type,
          expected_prior_event_id: action.expected_prior_event_id,
          metadata: action.metadata,
          created_at: action.captured_at,
        } as never,
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (ledgerErr) {
        failedIds.push(action.id);
        continue;
      }

      // Cascading rule: chained onto an event that already lost its race.
      const cascaded =
        action.expected_prior_event_id !== null && poisoned.has(action.expected_prior_event_id);

      if (!cascaded) {
        // 2. Atomic conditional pointer update.
        let q = supabase
          .from("assets")
          .update({ current_ledger_event_id: action.id } as never)
          .eq("id", action.asset_id)
          .eq("company_id", companyId)
          .select("id");
        q =
          action.expected_prior_event_id === null
            ? q.is("current_ledger_event_id", null)
            : q.eq("current_ledger_event_id", action.expected_prior_event_id);
        const { data: updated, error: updErr } = await q;

        if (!updErr && updated && updated.length > 0) {
          applied.push(action.id);
          continue;
        }
        if (updErr) {
          failedIds.push(action.id);
          continue;
        }
      }

      // 3. Conflict (direct race or cascade). File for manager review.
      poisoned.add(action.id);
      const { data: asset } = await supabase
        .from("assets")
        .select("current_ledger_event_id")
        .eq("id", action.asset_id)
        .single();
      let competingActor: string | null = null;
      const currentEventId = (asset as { current_ledger_event_id?: string | null } | null)
        ?.current_ledger_event_id;
      if (currentEventId) {
        const { data: ev } = await supabase
          .from("asset_ledger")
          .select("actor_id")
          .eq("id", currentEventId)
          .maybeSingle();
        competingActor = (ev as { actor_id?: string | null } | null)?.actor_id ?? null;
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("ledger_conflicts").insert({
        company_id: companyId,
        asset_id: action.asset_id,
        conflicting_event_id: action.id,
        competing_actor_id: competingActor,
        status: "PENDING_REVIEW",
      } as never);

      conflicts.push({ asset_id: action.asset_id, action_type: action.action_type });
    }

    return {
      applied: applied.length,
      conflicts,
      failed: failedIds.length,
      failed_ids: failedIds,
    };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ReportInput = z.object({
  route: z.string().max(200),
  screen_label: z.string().max(80),
  problem: z.string().max(120),
  detail: z.string().max(1000),
  severity: z.enum(["error", "warning"]),
  device_kind: z.string().max(40),
  platform: z.string().max(40),
  viewport: z.string().max(24),
  app_build: z.string().max(80),
  was_offline: z.boolean(),
  recovery_actions: z.array(z.string().max(200)).max(6),
});

const ReviewInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "reviewed", "resolved"]),
  reviewer_notes: z.string().max(1000).nullable(),
});

const DEDUPE_WINDOW_MS = 60 * 60 * 1000;

/** Records a scrubbed crash report for the signed-in user's company. */
export const recordCrashReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReportInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    const companyId = (profile as { company_id: string | null } | null)?.company_id;
    if (!companyId) return { recorded: false as const };

    // Same problem on the same screen within the hour bumps a counter instead of
    // flooding the safety manager's list.
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
    const { data: existing } = await context.supabase
      .from("crash_reports")
      .select("id, occurrences")
      .eq("company_id", companyId)
      .eq("route", data.route)
      .eq("problem", data.problem)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prior = existing as { id: string; occurrences: number } | null;
    if (prior) {
      await context.supabase
        .from("crash_reports")
        .update({ occurrences: prior.occurrences + 1 } as never)
        .eq("id", prior.id);
      return { recorded: true as const, id: prior.id, repeated: true };
    }

    const { data: row, error } = await context.supabase
      .from("crash_reports")
      .insert({
        company_id: companyId,
        reported_by: context.userId,
        ...data,
      } as never)
      .select("id")
      .maybeSingle();
    if (error) return { recorded: false as const };
    return { recorded: true as const, id: (row as { id: string } | null)?.id, repeated: false };
  });

/** Safety managers mark a report reviewed or resolved. */
export const reviewCrashReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("crash_reports")
      .update({ status: data.status, reviewer_notes: data.reviewer_notes } as never)
      .eq("id", data.id);
    if (error) throw new Error("You don't have permission to update this report.");
    return { ok: true };
  });

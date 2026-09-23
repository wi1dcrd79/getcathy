import { Inngest, eventType } from "inngest";
import { z } from "zod";

/**
 * Typed event catalogue for C.A.T.H.Y. durable execution.
 * `telemetry.sync` is intentionally absent: it is cron-triggered, never emitted.
 */

export const assetTransferredSchema = z.object({
  company_id: z.string().uuid(),
  asset_id: z.string().uuid(),
  asset_tag: z.string(),
  from_location: z.string().nullable(),
  to_location: z.string(),
  moved_by: z.string().uuid().nullable(),
  captured_at: z.string(),
});

export const certExpiringSchema = z.object({
  company_id: z.string().uuid(),
  cert_id: z.string().uuid(),
  personnel_id: z.string().uuid().nullable(),
  threshold_days: z.union([z.literal(30), z.literal(14), z.literal(7)]),
  expiration_date: z.string(),
});

export const auditBinderRequestedSchema = z.object({
  company_id: z.string().uuid(),
  requested_by: z.string().uuid().nullable(),
  job_id: z.string().uuid(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
});

export const hazardAnalysisRequestedSchema = z.object({
  company_id: z.string().uuid(),
  requested_by: z.string().uuid(),
  asset_tag: z.string().nullable(),
  notes: z.string().min(10),
  photo_count: z.number().int().min(0).max(8),
});

export const assetTransferred = eventType("asset.transferred", {
  schema: assetTransferredSchema,
});
export const certExpiring = eventType("cert.expiring", { schema: certExpiringSchema });
export const auditBinderRequested = eventType("audit_binder.requested", {
  schema: auditBinderRequestedSchema,
});
export const hazardAnalysisRequested = eventType("hazard_analysis.requested", {
  schema: hazardAnalysisRequestedSchema,
});

/** Runtime validation map used by the gateway emitter. */
export const eventSchemas = {
  "asset.transferred": assetTransferredSchema,
  "cert.expiring": certExpiringSchema,
  "audit_binder.requested": auditBinderRequestedSchema,
  "hazard_analysis.requested": hazardAnalysisRequestedSchema,
} as const;

export type CathyEventName = keyof typeof eventSchemas;
export type CathyEventData<T extends CathyEventName> = z.infer<(typeof eventSchemas)[T]>;

export const inngest = new Inngest({ id: "cathy-operations" });

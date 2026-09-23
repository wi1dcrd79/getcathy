import { EventSchemas, Inngest } from "inngest";
import { z } from "zod";

/**
 * Typed event catalogue for C.A.T.H.Y. durable execution.
 * telemetry.sync is intentionally absent: it is cron-triggered, not emitted.
 */
export const assetTransferred = z.object({
  company_id: z.string().uuid(),
  asset_id: z.string().uuid(),
  asset_tag: z.string(),
  from_location: z.string().nullable(),
  to_location: z.string(),
  moved_by: z.string().uuid().nullable(),
  captured_at: z.string(),
});

export const certExpiring = z.object({
  company_id: z.string().uuid(),
  cert_id: z.string().uuid(),
  personnel_id: z.string().uuid().nullable(),
  threshold_days: z.union([z.literal(30), z.literal(14), z.literal(7)]),
  expiration_date: z.string(),
});

export const auditBinderRequested = z.object({
  company_id: z.string().uuid(),
  requested_by: z.string().uuid().nullable(),
  job_id: z.string().uuid(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
});

export const hazardAnalysisRequested = z.object({
  company_id: z.string().uuid(),
  requested_by: z.string().uuid(),
  asset_tag: z.string().nullable(),
  notes: z.string().min(10),
  photo_count: z.number().int().min(0).max(8).default(0),
});

export const eventSchemas = {
  "asset.transferred": { data: assetTransferred },
  "cert.expiring": { data: certExpiring },
  "audit_binder.requested": { data: auditBinderRequested },
  "hazard_analysis.requested": { data: hazardAnalysisRequested },
} as const;

export type CathyEventName = keyof typeof eventSchemas;

export type CathyEventData = {
  "asset.transferred": z.infer<typeof assetTransferred>;
  "cert.expiring": z.infer<typeof certExpiring>;
  "audit_binder.requested": z.infer<typeof auditBinderRequested>;
  "hazard_analysis.requested": z.infer<typeof hazardAnalysisRequested>;
};

export const inngest = new Inngest({
  id: "cathy-operations",
  schemas: new EventSchemas().fromZod(eventSchemas),
});

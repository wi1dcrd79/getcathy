import { z } from "zod";
import { get, set } from "idb-keyval";

export const continuityInput = z.object({
  id: z.uuid(),
  version: z.number().int().min(0),
  cert_type_code: z.string().trim().min(1).max(40),
  performed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= "1900-01-01" && s <= new Date().toISOString().slice(0, 10);
  }, "Enter a valid work date, not a future date."),
  work_reference: z.string().trim().min(1, "Work reference is required.").max(500),
  standard: z.string().trim().max(120),
  position: z.string().trim().max(120),
});
export type ContinuityInput = z.infer<typeof continuityInput>;
export type LocalWork = ContinuityInput & { queued: boolean; error?: string };
export function canReviewContinuity(role: string, userId: string, submittedBy: string, supervisorId: string | null) {
  return userId !== submittedBy && (["company_admin", "safety_director", "qc_inspector"].includes(role) || (role === "field_supervisor" && supervisorId === userId));
}
const key = (company: string, user: string) => `cathy.continuity.v1.${company}.${user}`;
export async function readLocalWork(company: string, user: string): Promise<LocalWork[]> {
  return (await get<LocalWork[]>(key(company, user))) ?? [];
}
export async function writeLocalWork(company: string, user: string, rows: LocalWork[]) {
  await set(key(company, user), rows);
}
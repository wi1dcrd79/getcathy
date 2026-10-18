import { describe, expect, it } from "vitest";
import { canReviewContinuity, continuityInput, readLocalWork, writeLocalWork } from "@/lib/personal-continuity";

describe("personal continuity rules", () => {
  it("requires an independent reviewer even for company admins", () => {
    expect(canReviewContinuity("company_admin", "worker", "worker", null)).toBe(false);
    expect(canReviewContinuity("company_admin", "reviewer", "worker", null)).toBe(true);
  });
  it("restricts field supervisors to their assigned worker", () => {
    expect(canReviewContinuity("field_supervisor", "reviewer", "worker", "other")).toBe(false);
    expect(canReviewContinuity("field_supervisor", "reviewer", "worker", "reviewer")).toBe(true);
    expect(canReviewContinuity("craftsman", "reviewer", "worker", "reviewer")).toBe(false);
  });
  it("rejects future and impossible performed dates", () => {
    const base = { id: crypto.randomUUID(), version: 0, cert_type_code: "SMAW", work_reference: "Job 42", standard: "ASME IX", position: "6G" };
    expect(continuityInput.safeParse({ ...base, performed_date: "2999-01-01" }).success).toBe(false);
    expect(continuityInput.safeParse({ ...base, performed_date: "2026-02-30" }).success).toBe(false);
    expect(continuityInput.safeParse({ ...base, performed_date: "2026-10-18" }).success).toBe(true);
  });
  it("keeps offline work isolated by worker and company", async () => {
    const work = { id: crypto.randomUUID(), version: 0, cert_type_code: "SMAW", performed_date: "2026-10-18", work_reference: "Job 42", standard: "ASME IX", position: "6G", queued: true };
    await writeLocalWork("company-a", "worker-a", [work]);
    expect(await readLocalWork("company-a", "worker-a")).toEqual([work]);
    expect(await readLocalWork("company-b", "worker-a")).toEqual([]);
    expect(await readLocalWork("company-a", "worker-b")).toEqual([]);
  });
});
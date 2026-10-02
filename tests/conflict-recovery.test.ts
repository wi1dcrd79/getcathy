/**
 * Spec for the 409 recovery flow. These tests describe the NEW behaviour
 * (server `code` + `existing`, queue `error_code` + `existing`). They fail on
 * main until the Lovable change lands; outbox.test.ts must stay green.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const submit = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({ userId: "user-a" as string | null }));

vi.mock("@/lib/signatures/submit-signature.functions", () => ({ submitSignature: submit }));
vi.mock("@/lib/signatures/signed-fields", () => ({ hashRecord: vi.fn(async () => "a".repeat(64)) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: session.userId ? { user: { id: session.userId } } : null },
      }),
    },
  },
}));

import { isRetryable, readSignatureQueue } from "@/lib/signatures/offline-queue";
import { flushSignatureQueue, signRecord } from "@/lib/signatures/sign-record";
import { makeItem, seed, setOnline } from "./helpers";

type Existing = {
  signer_role: string;
  synced_at: string;
  signed_by_me: boolean;
  content_sha256_matches: boolean;
};
const already = (existing: Existing) => ({
  ok: false,
  status: 409,
  code: "ALREADY_SIGNED",
  message: "This record has already been signed.",
  existing: { signature_id: "sig-9", ...existing },
});

beforeEach(async () => {
  submit.mockReset();
  session.userId = "user-a";
  setOnline(true);
  await seed([]);
});

describe("409 recovery", () => {
  it("lost response: own matching signature already on server -> synced, no conflict", async () => {
    await seed([makeItem()]);
    submit.mockResolvedValue(
      already({ signer_role: "qc_inspector", synced_at: "2026-10-01T10:05:00.000Z", signed_by_me: true, content_sha256_matches: true }),
    );
    const report = await flushSignatureQueue();
    expect(report.signed).toBe(1);
    expect(report.rejected).toEqual([]);
    expect(await readSignatureQueue()).toHaveLength(0);
  });

  it("someone else signed first -> conflict carrying their role and time", async () => {
    await seed([makeItem()]);
    submit.mockResolvedValue(
      already({ signer_role: "safety_director", synced_at: "2026-10-01T10:05:00.000Z", signed_by_me: false, content_sha256_matches: true }),
    );
    const report = await flushSignatureQueue();
    expect(report.rejected).toHaveLength(1);
    expect((await readSignatureQueue())[0]).toMatchObject({
      status: "conflict",
      error_code: "ALREADY_SIGNED",
      existing: { signer_role: "safety_director", synced_at: "2026-10-01T10:05:00.000Z" },
    });
  });

  it("signed version differs from what the user reviewed -> conflict flags the mismatch", async () => {
    await seed([makeItem()]);
    submit.mockResolvedValue(
      already({ signer_role: "company_admin", synced_at: "2026-10-01T10:05:00.000Z", signed_by_me: false, content_sha256_matches: false }),
    );
    await flushSignatureQueue();
    expect((await readSignatureQueue())[0]).toMatchObject({
      status: "conflict",
      existing: { content_sha256_matches: false },
    });
  });

  it("own signature but different content is NOT auto-cleared", async () => {
    await seed([makeItem()]);
    submit.mockResolvedValue(
      already({ signer_role: "qc_inspector", synced_at: "2026-10-01T10:05:00.000Z", signed_by_me: true, content_sha256_matches: false }),
    );
    await flushSignatureQueue();
    expect((await readSignatureQueue())[0]!.status).toBe("conflict");
  });

  it("binder not compiled -> blocked failure with its own code, not a conflict, not retryable", async () => {
    await seed([makeItem()]);
    submit.mockResolvedValue({
      ok: false,
      status: 409,
      code: "BINDER_NOT_SIGNABLE",
      binder_status: "draft",
      message: "This binder is draft and can't be signed.",
    });
    await flushSignatureQueue();
    const [q] = await readSignatureQueue();
    expect(q).toMatchObject({ status: "failed", error_code: "BINDER_NOT_SIGNABLE" });
    expect(isRetryable(q!)).toBe(false);
  });

  it("online sign hitting own matching signature resolves as signed", async () => {
    submit.mockResolvedValue(
      already({ signer_role: "qc_inspector", synced_at: "2026-10-01T10:05:00.000Z", signed_by_me: true, content_sha256_matches: true }),
    );
    const out = await signRecord({
      table: "inspections",
      row: { id: "insp-1" },
      companyId: "co-1",
      label: "Inspection insp-1",
      pngBase64: "iVBORw0KGgo=",
    });
    expect(out).toEqual({ kind: "signed" });
    expect(await readSignatureQueue()).toHaveLength(0);
  });
});

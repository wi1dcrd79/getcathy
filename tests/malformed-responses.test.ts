/**
 * Malformed or incomplete ALREADY_SIGNED / BINDER_NOT_SIGNABLE responses.
 * Rule under test: never act on a guess. Anything not fully valid must land in
 * the outbox as conflict/failed, never as "signed", and never as retryable.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const submit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/signatures/submit-signature.functions", () => ({ submitSignature: submit }));
vi.mock("@/lib/signatures/signed-fields", () => ({ hashRecord: vi.fn(async () => "a".repeat(64)) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "user-a" } } } }) },
  },
}));

import {
  conflictKind,
  normalizeExisting,
  normalizeRejection,
} from "@/lib/signatures/conflict";
import { isRetryable, readSignatureQueue } from "@/lib/signatures/offline-queue";
import { flushSignatureQueue, signRecord } from "@/lib/signatures/sign-record";
import { makeItem, seed, setOnline } from "./helpers";

const valid = {
  signature_id: "sig-9",
  signer_role: "safety_director",
  synced_at: "2026-10-01T10:05:00.000Z",
  signed_by_me: false,
  content_sha256_matches: true,
};
const already = (over: Record<string, unknown> = {}) => ({
  ok: false,
  status: 409,
  code: "ALREADY_SIGNED",
  message: "This record has already been signed.",
  existing: valid,
  ...over,
});
const binder = (over: Record<string, unknown> = {}) => ({
  ok: false,
  status: 409,
  code: "BINDER_NOT_SIGNABLE",
  binder_status: "draft",
  message: "This binder is draft and can't be signed.",
  ...over,
});

async function flushOne(response: unknown) {
  await seed([makeItem()]);
  submit.mockResolvedValue(response);
  const report = await flushSignatureQueue();
  const [q] = await readSignatureQueue();
  return { report, q: q! };
}

beforeEach(async () => {
  submit.mockReset();
  setOnline(true);
  await seed([]);
});

describe("normalizeExisting", () => {
  it("accepts a complete block", () => {
    expect(normalizeExisting(valid)).toEqual(valid);
  });

  it.each([null, undefined, "x", 42, [], [valid]])("rejects non-object %j", (raw) => {
    expect(normalizeExisting(raw)).toBeNull();
  });

  it.each(["signature_id", "signer_role", "synced_at", "signed_by_me", "content_sha256_matches"])(
    "rejects when %s is missing",
    (field) => {
      const raw: Record<string, unknown> = { ...valid };
      delete raw[field];
      expect(normalizeExisting(raw)).toBeNull();
    },
  );

  it.each([
    ["signed_by_me", "true"],
    ["signed_by_me", 1],
    ["content_sha256_matches", "false"],
    ["content_sha256_matches", 0],
    ["signer_role", ""],
    ["signer_role", 7],
    ["synced_at", "not-a-date"],
    ["signature_id", "  "],
  ])("rejects %s = %j", (field, value) => {
    expect(normalizeExisting({ ...valid, [field]: value })).toBeNull();
  });

  it("maps to a conflict kind, and unknown when invalid", () => {
    expect(conflictKind(normalizeExisting(valid))).toBe("other_same");
    expect(conflictKind(normalizeExisting({ ...valid, content_sha256_matches: false }))).toBe(
      "other_different",
    );
    expect(conflictKind(normalizeExisting({ ...valid, signed_by_me: true }))).toBe("own_same");
    expect(conflictKind(normalizeExisting({ ...valid, signed_by_me: true, content_sha256_matches: false }))).toBe(
      "own_different",
    );
    expect(conflictKind(normalizeExisting({ signer_role: "x" }))).toBe("unknown");
  });
});

describe("normalizeRejection", () => {
  it("fills a default message and 409 when a known code arrives bare", () => {
    expect(normalizeRejection({ code: "ALREADY_SIGNED" })).toMatchObject({
      status: 409,
      message: "This record has already been signed.",
      existing: null,
    });
    expect(normalizeRejection({ code: "BINDER_NOT_SIGNABLE" })).toMatchObject({
      status: 409,
      message: "This binder can't be signed right now.",
    });
  });

  it.each([undefined, null, "409", 409.5, 99, 700, Number.NaN])("falls back on status %j", (status) => {
    expect(normalizeRejection({ code: "ALREADY_SIGNED", status }).status).toBe(409);
    expect(normalizeRejection({ status }).status).toBe(500);
  });

  it.each([undefined, null, "", "   ", 123, {}])("replaces unusable message %j", (message) => {
    const n = normalizeRejection({ status: 409, message });
    expect(typeof n.message).toBe("string");
    expect(n.message.trim()).not.toBe("");
  });

  it("ignores a non-string binder_status and existing on other codes", () => {
    expect(normalizeRejection(binder({ binder_status: 42, existing: valid }))).toMatchObject({
      binder_status: undefined,
      existing: null,
    });
  });

  it.each([null, undefined, "boom", 7, []])("survives a garbage body %j", (raw) => {
    expect(normalizeRejection(raw)).toMatchObject({ status: 500, existing: null });
  });
});

describe("ALREADY_SIGNED, malformed", () => {
  it.each([
    ["existing null", { existing: null }],
    ["existing missing", { existing: undefined }],
    ["existing is a string", { existing: "signed" }],
    ["existing is an array", { existing: [valid] }],
    ["existing empty object", { existing: {} }],
    ["missing content_sha256_matches", { existing: { ...valid, signed_by_me: true, content_sha256_matches: undefined } }],
    ["missing signed_by_me", { existing: { ...valid, signed_by_me: undefined, content_sha256_matches: true } }],
    ["flags are truthy strings", { existing: { ...valid, signed_by_me: "true", content_sha256_matches: "true" } }],
  ])("%s -> conflict, kept, not retryable, never cleared", async (_n, over) => {
    const { report, q } = await flushOne(already(over));
    expect(report.signed).toBe(0);
    expect(report.rejected).toHaveLength(1);
    expect(q).toMatchObject({ status: "conflict", error_code: "ALREADY_SIGNED", error_status: 409 });
    expect(q.existing ?? null).toBeNull();
    expect(isRetryable(q)).toBe(false);
  });

  it("missing message -> conflict with a default message, never undefined", async () => {
    const { report, q } = await flushOne(already({ message: undefined }));
    expect(q.status).toBe("conflict");
    expect(report.rejected[0]!.message).toBe("This record has already been signed.");
    expect(q.error).toBe("This record has already been signed.");
  });

  it("missing status with the code present is still a conflict", async () => {
    const { q } = await flushOne(already({ status: undefined }));
    expect(q).toMatchObject({ status: "conflict", error_status: 409 });
  });

  it("legacy: no code but the old message -> conflict", async () => {
    const { q } = await flushOne(already({ code: undefined, existing: undefined }));
    expect(q.status).toBe("conflict");
  });

  it("409 with no code and no message -> failed (not a guessed conflict), not retryable", async () => {
    const { q } = await flushOne({ ok: false, status: 409 });
    expect(q.status).toBe("failed");
    expect(isRetryable(q)).toBe(false);
  });

  it("valid existing is stored intact", async () => {
    const { q } = await flushOne(already());
    expect(q).toMatchObject({ status: "conflict", existing: valid });
  });

  it("online sign with a malformed block resolves as rejected, not signed", async () => {
    submit.mockResolvedValue(already({ existing: { ...valid, signed_by_me: "true", content_sha256_matches: "true" } }));
    const out = await signRecord({
      table: "inspections",
      row: { id: "insp-1" },
      companyId: "co-1",
      label: "Inspection insp-1",
      pngBase64: "iVBORw0KGgo=",
    });
    expect(out).toMatchObject({ kind: "rejected", status: 409, code: "ALREADY_SIGNED" });
    expect(await readSignatureQueue()).toHaveLength(0);
  });
});

describe("BINDER_NOT_SIGNABLE, malformed", () => {
  it.each([
    ["binder_status missing", { binder_status: undefined }],
    ["binder_status wrong type", { binder_status: 42 }],
    ["binder_status null", { binder_status: null }],
    ["stray existing block", { existing: valid }],
  ])("%s -> failed with its own code, not retryable", async (_n, over) => {
    const { q } = await flushOne(binder(over));
    expect(q).toMatchObject({ status: "failed", error_code: "BINDER_NOT_SIGNABLE", error_status: 409 });
    expect(q.existing ?? null).toBeNull();
    expect(isRetryable(q)).toBe(false);
  });

  it("missing message -> default message, never undefined", async () => {
    const { report, q } = await flushOne(binder({ message: undefined }));
    expect(q.error).toBe("This binder can't be signed right now.");
    expect(report.rejected[0]!.message).toBe("This binder can't be signed right now.");
  });

  it("missing status with the code present -> 409, still failed", async () => {
    const { q } = await flushOne(binder({ status: undefined }));
    expect(q).toMatchObject({ status: "failed", error_status: 409 });
  });

  it("wrong status type does not make it retryable", async () => {
    const { q } = await flushOne(binder({ status: "500" }));
    expect(q.error_status).toBe(409);
    expect(isRetryable(q)).toBe(false);
  });

  it("is not a conflict even if the message mentions signing", async () => {
    const { q } = await flushOne(binder({ message: "Binder has already been signed or is not ready" }));
    expect(q.status).toBe("failed");
  });
});
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

import {
  dismissSignature,
  enqueueSignature,
  isRetryable,
  readSignatureQueue,
} from "@/lib/signatures/offline-queue";
import { flushSignatureQueue, retrySignature, signRecord } from "@/lib/signatures/sign-record";
import { makeItem, seed, setOnline, wait } from "./helpers";

const OK = { ok: true, signature_id: "sig-1", synced_at: "2026-10-01T12:00:00.000Z" };
const sign = (id = "insp-1") =>
  signRecord({
    table: "inspections",
    row: { id },
    companyId: "co-1",
    label: `Inspection ${id}`,
    pngBase64: "iVBORw0KGgo=",
  });

beforeEach(async () => {
  submit.mockReset();
  session.userId = "user-a";
  setOnline(true);
  await seed([]);
});

describe("queue + sync", () => {
  it("queues offline with the capturing user and never calls the server", async () => {
    setOnline(false);
    expect(await sign()).toEqual({ kind: "queued" });
    expect(submit).not.toHaveBeenCalled();
    const [q] = await readSignatureQueue();
    expect(q).toMatchObject({
      signer_id: "user-a",
      status: "queued",
      target: "inspection_id",
      target_id: "insp-1",
    });
  });

  it("submits the ORIGINAL offline timestamps after reconnect and clears the item", async () => {
    setOnline(false);
    await sign();
    const [q] = await readSignatureQueue();
    await wait(10);
    setOnline(true);
    submit.mockResolvedValue(OK);
    const report = await flushSignatureQueue();
    expect(report.signed).toBe(1);
    const sent = submit.mock.calls[0]![0].data;
    expect(sent.offline_created_at).toBe(q!.offline_created_at);
    expect(sent.signed_at).toBe(q!.signed_at);
    expect(await readSignatureQueue()).toHaveLength(0);
  });

  it("keeps timestamps intact and stays queued on a network failure", async () => {
    const item = makeItem({ target_id: "insp-1" });
    await seed([item]);
    submit.mockRejectedValue(new Error("Failed to fetch"));
    const report = await flushSignatureQueue();
    expect(report.pending).toBe(1);
    const [q] = await readSignatureQueue();
    expect(q).toMatchObject({
      status: "queued",
      attempts: 1,
      offline_created_at: item.offline_created_at,
      signed_at: item.signed_at,
    });
  });

  it("submits in capture order regardless of storage order", async () => {
    const late = makeItem({ target_id: "late", offline_created_at: "2026-10-01T11:00:00.000Z" });
    const early = makeItem({ target_id: "early", offline_created_at: "2026-10-01T09:00:00.000Z" });
    await seed([late, early]);
    submit.mockResolvedValue(OK);
    await flushSignatureQueue();
    const order = submit.mock.calls.map((c) => c[0].data.inspection_id);
    expect(order).toEqual(["early", "late"]);
  });

  it("online sign that succeeds leaves nothing in the outbox", async () => {
    submit.mockResolvedValue(OK);
    expect(await sign()).toEqual({ kind: "signed" });
    expect(await readSignatureQueue()).toHaveLength(0);
  });
});

describe("shared device", () => {
  it("never submits another user's queued signature", async () => {
    await seed([makeItem({ signer_id: "user-a" })]);
    session.userId = "user-b";
    await flushSignatureQueue();
    expect(submit).not.toHaveBeenCalled();
    expect((await readSignatureQueue())[0]).toMatchObject({ signer_id: "user-a", status: "queued" });
  });

  it("legacy items without signer_id become needs_resign and are never submitted", async () => {
    await seed([makeItem({ signer_id: undefined })]);
    await flushSignatureQueue();
    expect(submit).not.toHaveBeenCalled();
    expect((await readSignatureQueue())[0]!.status).toBe("needs_resign");
  });

  it("only the capturing user can dismiss", async () => {
    const item = makeItem();
    await seed([item]);
    await dismissSignature(item.local_id, "user-b");
    expect(await readSignatureQueue()).toHaveLength(1);
    await dismissSignature(item.local_id, "user-a");
    expect(await readSignatureQueue()).toHaveLength(0);
  });
});

describe("rejections", () => {
  it("409 already signed -> conflict, not retryable", async () => {
    const item = makeItem();
    await seed([item]);
    submit.mockResolvedValue({ ok: false, status: 409, message: "This record has already been signed." });
    await flushSignatureQueue();
    const [q] = await readSignatureQueue();
    expect(q).toMatchObject({ status: "conflict", error_status: 409 });
    expect(isRetryable(q!)).toBe(false);
    expect(await retrySignature(item.local_id)).toBeNull();
  });

  it("409 binder-not-compiled is a failure with the server's own message, not a conflict", async () => {
    await seed([makeItem()]);
    submit.mockResolvedValue({ ok: false, status: 409, message: "This binder is draft and can't be signed." });
    await flushSignatureQueue();
    expect((await readSignatureQueue())[0]).toMatchObject({
      status: "failed",
      error: "This binder is draft and can't be signed.",
    });
  });

  it("400 hash mismatch is failed and never blindly retryable", async () => {
    const item = makeItem();
    await seed([item]);
    submit.mockResolvedValue({ ok: false, status: 400, message: "Signature content hash does not match the current record contents." });
    await flushSignatureQueue();
    const [q] = await readSignatureQueue();
    expect(q).toMatchObject({ status: "failed", error_status: 400 });
    expect(isRetryable(q!)).toBe(false);
    expect(await retrySignature(item.local_id)).toBeNull();
  });

  it("unexpected server error (500) is retryable and a retry can succeed", async () => {
    const item = makeItem();
    await seed([item]);
    submit.mockRejectedValueOnce(new Error("Failed to store signature image: boom"));
    await flushSignatureQueue();
    const [q] = await readSignatureQueue();
    expect(q).toMatchObject({ status: "failed", error_status: 500 });
    expect(isRetryable(q!)).toBe(true);
    submit.mockResolvedValue(OK);
    const report = await retrySignature(item.local_id);
    expect(report?.signed).toBe(1);
    expect(await readSignatureQueue()).toHaveLength(0);
  });
});

describe("enqueue", () => {
  it("returns the existing active item instead of duplicating", async () => {
    const a = makeItem({ target_id: "r1" });
    await enqueueSignature(a);
    const again = await enqueueSignature(makeItem({ target_id: "r1" }));
    expect(again.local_id).toBe(a.local_id);
    expect(await readSignatureQueue()).toHaveLength(1);
  });

  it("replaces a conflict/failed item with the new capture (no silent drop)", async () => {
    const old = makeItem({ target_id: "r1", status: "failed", error: "x", error_status: 400 });
    await seed([old]);
    const fresh = makeItem({ target_id: "r1" });
    await enqueueSignature(fresh);
    const q = await readSignatureQueue();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ local_id: fresh.local_id, status: "queued", attempts: 0 });
  });
});

describe("tombstone discard", () => {
  it("dismiss tombstones and survives later writes", async () => {
    const a = makeItem({ signer_id: "user-a" });
    const b = makeItem({ signer_id: "user-a" });
    await seed([a, b]);
    await dismissSignature(a.local_id, "user-a", "test");
    expect(await readSignatureQueue()).toHaveLength(1);
    await flushSignatureQueue();
    const raw = (await get(KEY)) as QueuedSignature[];
    const t = raw.find((x) => x.local_id === a.local_id)!;
    expect(t.status).toBe("discarded");
    expect(t.signature_png_base64).toBe("");
    expect(t.content_sha256).toBe(a.content_sha256);
    expect(t.discarded_by).toBe("user-a");
    expect(t.discard_reason).toBe("test");
  });
});

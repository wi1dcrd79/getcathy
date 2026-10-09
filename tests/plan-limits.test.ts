import { describe, expect, it } from "vitest";
import {
  PLANS,
  assetLimitForTier,
  checkBulkAssetImport,
  isAtAssetLimit,
  upgradeTargetFor,
} from "../src/lib/plans";
import { limitCodeOf } from "../src/lib/certvault-data";

describe("plan limits", () => {
  it("Free: 1 seat, 3 assets", () => {
    expect(PLANS.free.seats).toBe(1);
    expect(assetLimitForTier("free")).toBe(3);
    expect(isAtAssetLimit("free", 2)).toBe(false);
    expect(isAtAssetLimit("free", 3)).toBe(true);
    expect(upgradeTargetFor("free")).toBe("pro");
  });

  it("Pro: 3 seats, 15 assets, upgrades to Enterprise", () => {
    expect(PLANS.pro.seats).toBe(3);
    expect(assetLimitForTier("pro")).toBe(15);
    expect(isAtAssetLimit("pro", 14)).toBe(false);
    expect(isAtAssetLimit("pro", 15)).toBe(true);
    expect(upgradeTargetFor("pro")).toBe("enterprise");
  });

  it("Enterprise: unlimited", () => {
    expect(assetLimitForTier("enterprise")).toBeNull();
    expect(isAtAssetLimit("enterprise", 10_000)).toBe(false);
    expect(PLANS.enterprise.seats).toBeGreaterThan(1000);
  });

  it("unknown tier falls back to Free", () => {
    expect(assetLimitForTier(null)).toBe(3);
  });
});

describe("bulk CSV pre-check", () => {
  it("existing tags are updates and do not count", () => {
    const r = checkBulkAssetImport({
      tier: "pro",
      existingCount: 14,
      existingTags: ["A-1", "A-2"],
      incomingTags: ["a-1", "A-2 ", "NEW-1"],
    });
    expect(r.newCount).toBe(1);
    expect(r.ok).toBe(true);
  });

  it("stops Pro import that would pass 15", () => {
    const r = checkBulkAssetImport({
      tier: "pro",
      existingCount: 14,
      existingTags: [],
      incomingTags: ["N1", "N2"],
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("room for 1");
  });

  it("stops Free import that would pass 3", () => {
    const r = checkBulkAssetImport({ tier: "free", existingCount: 2, existingTags: [], incomingTags: ["X", "Y"] });
    expect(r.ok).toBe(false);
  });

  it("never stops Enterprise", () => {
    const tags = Array.from({ length: 500 }, (_, i) => `T${i}`);
    expect(checkBulkAssetImport({ tier: "enterprise", existingCount: 900, existingTags: [], incomingTags: tags }).ok).toBe(true);
  });
});

describe("limit error detection", () => {
  it("recognises both limit codes", () => {
    expect(limitCodeOf({ message: "FREE_PLAN_LIMIT" })).toBe("FREE_PLAN_LIMIT");
    expect(limitCodeOf(new Error("PRO_PLAN_LIMIT"))).toBe("PRO_PLAN_LIMIT");
    expect(limitCodeOf(new Error("other"))).toBeNull();
  });
});

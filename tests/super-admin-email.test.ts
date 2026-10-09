import { describe, expect, it } from "vitest";
import { isSuperAdminEmail } from "@/lib/legal";

describe("isSuperAdminEmail", () => {
  it("accepts both owner addresses, case- and whitespace-insensitively", () => {
    expect(isSuperAdminEmail("luisgonzalez@cathyindustries.com")).toBe(true);
    expect(isSuperAdminEmail("  WI1DCRD79@gmail.com ")).toBe(true);
  });
  it("rejects other, empty and missing emails", () => {
    expect(isSuperAdminEmail("someone@cathyindustries.com")).toBe(false);
    expect(isSuperAdminEmail("")).toBe(false);
    expect(isSuperAdminEmail(null)).toBe(false);
    expect(isSuperAdminEmail(undefined)).toBe(false);
  });
});

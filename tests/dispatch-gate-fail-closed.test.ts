import { describe, it, expect } from "vitest";
import { buildDispatchRows, evaluateDispatch } from "@/lib/compliance-reports-data";
import type { PersonnelCert, PersonnelRecord } from "@/lib/personnel-data";

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

const cert = (exp: string | null) =>
  ({
    id: "c1",
    personnel_id: "p1",
    cert_name: "AWS D1.1 Structural Welder",
    issue_date: iso(-300),
    expiration_date: exp,
    approval_status: "approved",
  }) as unknown as PersonnelCert;

describe("dispatch gate fails closed when gate data is unavailable", () => {
  it("blocks a calendar-valid cert as unverified", () => {
    const r = evaluateDispatch(cert(iso(200)), null, [], true);
    expect(r.status).toBe("unverified");
    expect(r.isDispatchable).toBe(false);
    expect(r.daysRemaining).toBeNull();
  });

  it("still reports expired certs as expired", () => {
    expect(evaluateDispatch(cert(iso(-1)), null, [], true).status).toBe("expired");
  });

  it("still reports missing certs as missing", () => {
    expect(evaluateDispatch(null, null, [], true).status).toBe("missing_cert");
  });

  it("is unchanged when gate data exists", () => {
    const r = evaluateDispatch(cert(iso(200)), null, [], false);
    expect(r.status).toBe("compliant");
    expect(r.isDispatchable).toBe(true);
  });
});

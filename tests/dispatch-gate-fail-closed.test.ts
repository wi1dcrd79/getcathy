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

describe("multi-cert personnel surface the worst status", () => {
  const person = {
    id: "p1",
    first_name: "Test",
    last_name: "Welder",
    employee_id: "T-1",
    trade_title: "Welder",
    status: "active",
  } as unknown as PersonnelRecord;

  const dualGateTypes = [
    { code: "SMAW", name: "Structural Welder", requires_continuity: true },
  ];

  const smawCert = {
    ...cert(iso(200)),
    id: "c-smaw",
    cert_name: "AWS D1.1 Structural Welder (SMAW)",
    issue_date: iso(-300),
  } as PersonnelCert;

  const safetyCard = {
    ...cert(iso(300)),
    id: "c-safety",
    cert_name: "OSHA 30 Safety Card",
    issue_date: iso(-5),
  } as PersonnelCert;

  it("a newer safety card does not hide a lapsed welder continuity clock", () => {
    const rows = buildDispatchRows(
      [person],
      [safetyCard, smawCert],
      dualGateTypes,
      [], // no continuity logs: 300 days since issue > 150-day limit
      false,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].evaluation.status).toBe("lapsed");
    expect(rows[0].evaluation.isDispatchable).toBe(false);
    expect(rows[0].cert?.id).toBe("c-smaw");
  });

  it("a newer expired cert does not hide a valid trade cert", () => {
    const expiredCard = { ...safetyCard, expiration_date: iso(-1) } as PersonnelCert;
    const rows = buildDispatchRows([person], [expiredCard, smawCert], dualGateTypes, [
      {
        id: "l1",
        personnel_id: "p1",
        cert_type_code: "SMAW",
        performed_date: iso(-10),
        work_reference: null,
        verified_by: null,
      },
    ]);
    expect(rows[0].evaluation.status).toBe("expired");
    expect(rows[0].evaluation.isDispatchable).toBe(false);
  });

  it("shows compliant when every cert is compliant", () => {
    const rows = buildDispatchRows([person], [safetyCard, smawCert], dualGateTypes, [
      {
        id: "l1",
        personnel_id: "p1",
        cert_type_code: "SMAW",
        performed_date: iso(-10),
        work_reference: null,
        verified_by: null,
      },
    ]);
    expect(rows[0].evaluation.status).toBe("compliant");
    expect(rows[0].evaluation.isDispatchable).toBe(true);
  });
});

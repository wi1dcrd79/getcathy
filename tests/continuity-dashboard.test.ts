import { describe, it, expect } from "vitest";
import { summarizeContinuityByTrade, type CertificationType, type ContinuityLog } from "@/lib/compliance-reports-data";
import type { PersonnelCert, PersonnelRecord } from "@/lib/personnel-data";

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
const person = (id: string) => ({ id, first_name: id, last_name: "X", trade_title: "Welder" }) as unknown as PersonnelRecord;
const cert = (pid: string, name: string, issued: number) =>
  ({ id: `c-${pid}-${name}`, personnel_id: pid, cert_name: name, issue_date: iso(issued), expiration_date: iso(400), approval_status: "approved" }) as unknown as PersonnelCert;
const log = (pid: string, code: string, ago: number): ContinuityLog => ({
  id: `l-${pid}-${ago}`, personnel_id: pid, cert_type_code: code, performed_date: iso(-ago), work_reference: null, verified_by: "u",
});
const types: CertificationType[] = [
  { code: "SMAW", name: "Structural Welder", requires_continuity: true },
  { code: "NFPA_70E", name: "Arc Flash", requires_continuity: false },
];

describe("continuity dashboard", () => {
  it("counts welders past 150 days as lapsed and 121-150 as warning", () => {
    const people = [person("a"), person("b"), person("c")];
    const certs = [cert("a", "SMAW", -400), cert("b", "SMAW", -400), cert("c", "SMAW", -400)];
    const logs = [log("a", "SMAW", 151), log("b", "SMAW", 130), log("c", "SMAW", 10)];
    const [smaw] = summarizeContinuityByTrade(people, certs, types, logs);
    expect(smaw.lapsed).toBe(1);
    expect(smaw.warning).toBe(1);
    expect(smaw.compliant).toBe(1);
  });

  it("only lists continuity trades", () => {
    const out = summarizeContinuityByTrade([], [], types, []);
    expect(out.map((t) => t.type.code)).toEqual(["SMAW"]);
  });
});

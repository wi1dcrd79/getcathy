import { describe, it, expect } from "vitest";
import { buildDispatchRows } from "@/lib/compliance-reports-data";

const person = { id: "p1", company_id: "c", first_name: "A", last_name: "B", employee_id: "1", trade_title: "Electrician", status: "active" };
const types = [{ code: "NFPA_70E", name: "NFPA 70E Arc Flash Safety", requires_continuity: false }];
const cert = (id: string, issue: string, exp: string, name = "NFPA 70E (NFPA_70E)") => ({
  id, company_id: "c", personnel_id: "p1", cert_name: name, cert_number: null, issue_date: issue,
  expiration_date: exp, approval_status: "approved", submitted_by: null, approved_at: null, verified_by: null, created_at: issue,
});

describe("dispatch renewals", () => {
  it("a newer renewal supersedes an expired copy of the same cert", () => {
    const [row] = buildDispatchRows([person], [cert("old", "2020-01-01", "2021-01-01"), cert("new", "2025-01-01", "2099-01-01")], types, []);
    expect(row.evaluation.isDispatchable).toBe(true);
    expect(row.cert?.id).toBe("new");
  });

  it("an expired different cert still blocks", () => {
    const [row] = buildDispatchRows([person], [cert("a", "2025-01-01", "2099-01-01"), cert("b", "2020-01-01", "2021-01-01", "Rigger Card")], types, []);
    expect(row.evaluation.status).toBe("expired");
  });
});

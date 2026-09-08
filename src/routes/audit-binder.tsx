import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { fetchAssets, fetchWelders } from "@/lib/certvault-data";
import { fetchCerts, fetchPersonnel } from "@/lib/personnel-data";
import { BRAND_DIVISION, COPYRIGHT_LINE } from "@/lib/legal";
import { assetStatus, formatDate, welderStatus, CATEGORY_LABEL } from "@/lib/compliance";

export const Route = createFileRoute("/audit-binder")({
  head: () => ({
    meta: [
      { title: "Compliance Audit Binder | C.A.T.H.Y." },
      {
        name: "description",
        content:
          "Paginated, print-ready OSHA and client audit binder listing equipment, serials, bin locations, inspection stamps and welder continuity logs.",
      },
      { property: "og:title", content: "Compliance Audit Binder | C.A.T.H.Y." },
      {
        property: "og:description",
        content: "Print-ready compliance binder for OSHA and general contractor review.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditBinder,
});

function AuditBinder() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const { context } = useProfile();
  const companyName = context?.company?.name ?? "C.A.T.H.Y.";

  const assetsQ = useQuery({ queryKey: ["assets"], queryFn: fetchAssets, enabled: !!session });
  const weldersQ = useQuery({ queryKey: ["welders"], queryFn: fetchWelders, enabled: !!session });
  const peopleQ = useQuery({ queryKey: ["personnel"], queryFn: fetchPersonnel, enabled: !!session });
  const certsQ = useQuery({ queryKey: ["certs"], queryFn: fetchCerts, enabled: !!session });

  const assets = assetsQ.data ?? [];
  const welders = weldersQ.data ?? [];
  const people = peopleQ.data ?? [];
  const certs = (certsQ.data ?? []).filter((c) => c.approval_status !== "pending");

  return (
    <div className="binder min-h-screen">
      <header className="no-print sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-lg font-bold uppercase">Audit Binder</h1>
          <div className="flex gap-2">
            <Link
              to="/"
              className="rounded-md border border-border px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:border-primary"
            >
              Back
            </Link>
            <button
              onClick={() => window.print()}
              className="rounded-md bg-accent px-3 py-2 text-xs font-bold uppercase tracking-widest text-accent-foreground"
            >
              Print / Save PDF
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="watermark" aria-hidden="true">
          {BRAND_DIVISION}
        </div>

        <section className="binder-page">
          <div className="binder-head">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest">{BRAND_DIVISION}</p>
              <h2 className="text-2xl font-bold uppercase">Compliance Audit Binder</h2>
              <p className="text-xs uppercase tracking-widest">Prepared for {companyName}</p>
            </div>
            <p className="text-xs">
              Generated {new Date().toLocaleString()} · {assets.length} assets · {welders.length} welders
            </p>
          </div>

          <h3 className="binder-section">Section 1 — Active Equipment & Rigging</h3>
          <table className="binder-table">
            <thead>
              <tr>
                <th>Asset tag</th>
                <th>Description</th>
                <th>Serial / VIN</th>
                <th>Site › Zone › Bin</th>
                <th>Last inspection</th>
                <th>Expires</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.asset_tag}</td>
                  <td>
                    {a.name}
                    <br />
                    <small>{CATEGORY_LABEL[a.category]} · {a.make_model || "—"}</small>
                  </td>
                  <td>{a.serial_or_vin || "—"}</td>
                  <td>{a.current_location || a.location || "Unassigned"}</td>
                  <td>
                    {a.inspection
                      ? `${formatDate(a.inspection.inspection_date)} · ${a.inspection.inspector_name}`
                      : "No record"}
                  </td>
                  <td>{a.inspection ? formatDate(a.inspection.expiration_date) : "—"}</td>
                  <td>
                    {a.inspection
                      ? assetStatus(a.inspection.expiration_date, a.inspection.result)
                      : "Out of Compliance"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="binder-page">
          <h3 className="binder-section">Section 2 — Welder Continuity Log</h3>
          <table className="binder-table">
            <thead>
              <tr>
                <th>Stamp</th>
                <th>Welder</th>
                <th>Process</th>
                <th>Standard</th>
                <th>Continuity logged</th>
                <th>Expires</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {welders.map((w) => (
                <tr key={w.id}>
                  <td>{w.welder_id_stamp}</td>
                  <td>{w.welder_name}</td>
                  <td>{w.process}</td>
                  <td>{w.standard}</td>
                  <td>{formatDate(w.continuity_date)}</td>
                  <td>{formatDate(w.expiration_date)}</td>
                  <td>{welderStatus(w.continuity_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="binder-page">
          <h3 className="binder-section">Section 3 — Crew Certifications (QC signed off)</h3>
          <table className="binder-table">
            <thead>
              <tr>
                <th>Crew member</th>
                <th>Employee ID</th>
                <th>Craft</th>
                <th>Certification</th>
                <th>Cert / stamp no.</th>
                <th>Issued</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {certs.map((c) => {
                const p = people.find((pp) => pp.id === c.personnel_id);
                return (
                  <tr key={c.id}>
                    <td>{p ? `${p.last_name}, ${p.first_name}` : "—"}</td>
                    <td>{p?.employee_id ?? "—"}</td>
                    <td>{p?.trade_title ?? "—"}</td>
                    <td>{c.cert_name}</td>
                    <td>{c.cert_number ?? "—"}</td>
                    <td>{formatDate(c.issue_date)}</td>
                    <td>{c.expiration_date ? formatDate(c.expiration_date) : "No expiry"}</td>
                  </tr>
                );
              })}
              {certs.length === 0 && (
                <tr>
                  <td colSpan={7}>No signed-off crew certifications on file.</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-6 text-xs">
            Reviewed by ______________________________ Date ______________
          </p>
        </section>

        <footer className="binder-footer">
          <p>{BRAND_DIVISION} · Prepared for {companyName}</p>
          <p>{COPYRIGHT_LINE}</p>
        </footer>
      </main>
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import {
  QC_ROLES,
  addCustomTrade,
  addPersonnel,
  approveCert,
  certStatus,
  fetchCerts,
  fetchCustomTrades,
  fetchPersonnel,
  rejectCert,
  submitCert,
} from "@/lib/personnel-data";
import { TRADE_PRESETS, addMonths } from "@/lib/trade-presets";
import { StatusBadge } from "@/components/certvault/StatusBadge";
import { formatDate } from "@/lib/compliance";

export const Route = createFileRoute("/personnel")({
  head: () => ({
    meta: [
      { title: "Multi-Craft Continuity Matrix | CertVault AI" },
      {
        name: "description",
        content:
          "Track welder, boilermaker, plumber, crane and rigging certifications with built-in trade presets and QC sign-off on every continuity reset.",
      },
      { property: "og:title", content: "Multi-Craft Continuity Matrix | CertVault AI" },
      {
        property: "og:description",
        content: "Craft certifications, custom trade clocks and a pending QC sign-off queue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Personnel,
});

const label = "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground";
const field =
  "w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary";
const btn =
  "rounded-md border border-border px-3 py-2 text-xs font-semibold uppercase tracking-widest hover:border-primary";

type Tab = "matrix" | "presets" | "pending" | "trades";

function Personnel() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const { companyId, role } = useProfile();
  const canSignOff = QC_ROLES.includes(role);

  const peopleQ = useQuery({ queryKey: ["personnel"], queryFn: fetchPersonnel, enabled: !!session });
  const certsQ = useQuery({ queryKey: ["certs"], queryFn: fetchCerts, enabled: !!session });
  const tradesQ = useQuery({ queryKey: ["custom-trades"], queryFn: fetchCustomTrades, enabled: !!session });

  const people = peopleQ.data ?? [];
  const certs = certsQ.data ?? [];
  const trades = tradesQ.data ?? [];

  const [tab, setTab] = useState<Tab>("matrix");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const pending = useMemo(() => certs.filter((c) => c.approval_status === "pending"), [certs]);
  const approved = useMemo(() => certs.filter((c) => c.approval_status !== "pending"), [certs]);

  const refresh = () => {
    peopleQ.refetch();
    certsQ.refetch();
    tradesQ.refetch();
  };

  // ---- new crew member form ----
  const [p, setP] = useState({ first_name: "", last_name: "", employee_id: "", trade_title: "" });
  const savePerson = async () => {
    setErr(null);
    try {
      await addPersonnel({ ...p, companyId: companyId ?? "" });
      setP({ first_name: "", last_name: "", employee_id: "", trade_title: "" });
      setMsg("Crew member added.");
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add this crew member.");
    }
  };

  // ---- cert submission ----
  const [c, setC] = useState({
    personnel_id: "",
    cert_name: "",
    cert_number: "",
    issue_date: new Date().toISOString().slice(0, 10),
    months: 12,
  });
  const saveCert = async (pending: boolean) => {
    setErr(null);
    try {
      await submitCert({
        personnel_id: c.personnel_id,
        cert_name: c.cert_name,
        cert_number: c.cert_number,
        issue_date: c.issue_date,
        expiration_date: addMonths(c.issue_date, c.months),
        companyId: companyId ?? "",
        pending,
      });
      setC({ ...c, cert_name: "", cert_number: "" });
      setMsg(pending ? "Submitted for QC sign-off." : "Certification recorded.");
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save this certification.");
    }
  };

  // ---- custom trade ----
  const [t, setT] = useState({ trade_name: "", recurrence_months: 12 });
  const saveTrade = async () => {
    setErr(null);
    try {
      await addCustomTrade({ ...t, companyId: companyId ?? "" });
      setT({ trade_name: "", recurrence_months: 12 });
      setMsg("Custom craft added.");
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add this craft.");
    }
  };

  const applyPreset = (certName: string, months: number) => {
    setC((prev) => ({ ...prev, cert_name: certName, months }));
    setTab("matrix");
  };

  return (
    <div className="min-h-screen pb-16">
      <header className="no-print sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="hazard-stripe h-1 w-full opacity-70" />
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-bold uppercase leading-none">Multi-Craft Matrix</h1>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Trades · Certifications · Continuity
            </p>
          </div>
          <Link to="/" className={btn}>
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-5">
        <div className="flex gap-2 overflow-x-auto">
          {(
            [
              ["matrix", "Continuity Matrix"],
              ["presets", "Trade Presets"],
              ["pending", `Pending QC Sign-off (${pending.length})`],
              ["trades", "Custom Craft Engine"],
            ] as Array<[Tab, string]>
          ).map(([key, text]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-widest ${
                tab === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground"
              }`}
            >
              {text}
            </button>
          ))}
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}
        {msg && <p className="text-sm text-success">{msg}</p>}

        {tab === "matrix" && (
          <>
            <section className="panel p-4">
              <h2 className="text-sm font-bold uppercase tracking-widest">Add crew member</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <div>
                  <span className={label}>First name</span>
                  <input className={field} value={p.first_name} onChange={(e) => setP({ ...p, first_name: e.target.value })} />
                </div>
                <div>
                  <span className={label}>Last name</span>
                  <input className={field} value={p.last_name} onChange={(e) => setP({ ...p, last_name: e.target.value })} />
                </div>
                <div>
                  <span className={label}>Employee ID</span>
                  <input className={field} value={p.employee_id} onChange={(e) => setP({ ...p, employee_id: e.target.value })} />
                </div>
                <div>
                  <span className={label}>Craft title</span>
                  <input
                    list="craft-titles"
                    className={field}
                    value={p.trade_title}
                    onChange={(e) => setP({ ...p, trade_title: e.target.value })}
                  />
                  <datalist id="craft-titles">
                    {TRADE_PRESETS.map((tp) => (
                      <option key={tp.key} value={tp.title} />
                    ))}
                    {trades.map((ct) => (
                      <option key={ct.id} value={ct.trade_name} />
                    ))}
                  </datalist>
                </div>
              </div>
              <button
                onClick={savePerson}
                disabled={!p.first_name || !p.last_name || !p.employee_id || !p.trade_title}
                className="mt-3 rounded-md bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
              >
                Add crew member
              </button>
            </section>

            <section className="panel p-4">
              <h2 className="text-sm font-bold uppercase tracking-widest">Log a certification</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-5">
                <div>
                  <span className={label}>Crew member</span>
                  <select className={field} value={c.personnel_id} onChange={(e) => setC({ ...c, personnel_id: e.target.value })}>
                    <option value="">Select…</option>
                    {people.map((pp) => (
                      <option key={pp.id} value={pp.id}>
                        {pp.last_name}, {pp.first_name} · {pp.trade_title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className={label}>Certification</span>
                  <input className={field} value={c.cert_name} onChange={(e) => setC({ ...c, cert_name: e.target.value })} />
                </div>
                <div>
                  <span className={label}>Cert / stamp no.</span>
                  <input className={field} value={c.cert_number} onChange={(e) => setC({ ...c, cert_number: e.target.value })} />
                </div>
                <div>
                  <span className={label}>Issued</span>
                  <input type="date" className={field} value={c.issue_date} onChange={(e) => setC({ ...c, issue_date: e.target.value })} />
                </div>
                <div>
                  <span className={label}>Valid (months)</span>
                  <input
                    type="number"
                    min={1}
                    className={field}
                    value={c.months}
                    onChange={(e) => setC({ ...c, months: Number(e.target.value) || 12 })}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Expires {c.issue_date ? formatDate(addMonths(c.issue_date, c.months)) : "—"}
                {!canSignOff && " · your submissions wait for QC sign-off before the clock resets."}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => saveCert(!canSignOff)}
                  disabled={!c.personnel_id || !c.cert_name}
                  className="rounded-md bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
                >
                  {canSignOff ? "Record & sign off" : "Submit for QC sign-off"}
                </button>
              </div>
            </section>

            <section className="panel overflow-x-auto p-0">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                    <th className="px-4 py-3">Crew member</th>
                    <th className="px-4 py-3">Craft</th>
                    <th className="px-4 py-3">Certification</th>
                    <th className="px-4 py-3">Stamp / No.</th>
                    <th className="px-4 py-3">Expires</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {approved.map((cert) => {
                    const person = people.find((pp) => pp.id === cert.personnel_id);
                    return (
                      <tr key={cert.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3">
                          {person ? `${person.last_name}, ${person.first_name}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{person?.trade_title ?? "—"}</td>
                        <td className="px-4 py-3">{cert.cert_name}</td>
                        <td className="tag-mono px-4 py-3 text-muted-foreground">{cert.cert_number ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {cert.expiration_date ? formatDate(cert.expiration_date) : "No expiry"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={certStatus(cert.expiration_date)} />
                        </td>
                      </tr>
                    );
                  })}
                  {approved.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-sm text-muted-foreground">
                        No signed-off certifications yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </>
        )}

        {tab === "presets" && (
          <section className="grid gap-4 lg:grid-cols-2">
            {TRADE_PRESETS.map((tp) => (
              <article key={tp.key} className="panel p-4">
                <h2 className="text-base font-bold uppercase">{tp.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{tp.blurb}</p>
                <ul className="mt-3 space-y-1.5">
                  {tp.certs.map((cert) => (
                    <li key={cert.name} className="flex items-center justify-between gap-3 text-sm">
                      <span>
                        {cert.name}
                        <span className="ml-2 text-xs text-muted-foreground">{cert.months} mo</span>
                      </span>
                      <button onClick={() => applyPreset(cert.name, cert.months)} className={btn}>
                        Use
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        )}

        {tab === "pending" && (
          <section className="panel p-4">
            <h2 className="text-sm font-bold uppercase tracking-widest">Pending QC Sign-off</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Continuity clocks only reset once an authorized QC role signs a submission off.
            </p>
            <div className="mt-4 space-y-3">
              {pending.map((cert) => {
                const person = people.find((pp) => pp.id === cert.personnel_id);
                return (
                  <div key={cert.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/50 bg-input p-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {person ? `${person.last_name}, ${person.first_name}` : "Unknown crew member"} · {cert.cert_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Issued {formatDate(cert.issue_date)}
                        {cert.expiration_date ? ` · expires ${formatDate(cert.expiration_date)}` : ""}
                      </p>
                    </div>
                    {canSignOff ? (
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            await approveCert(cert.id);
                            setMsg("Signed off — continuity clock reset.");
                            refresh();
                          }}
                          className="rounded-md bg-success px-3 py-2 text-xs font-bold uppercase tracking-widest text-background"
                        >
                          Sign off
                        </button>
                        <button
                          onClick={async () => {
                            await rejectCert(cert.id);
                            setMsg("Submission rejected.");
                            refresh();
                          }}
                          className={btn}
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs uppercase tracking-widest text-warning">Awaiting QC</span>
                    )}
                  </div>
                );
              })}
              {pending.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing waiting on QC right now.</p>
              )}
            </div>
          </section>
        )}

        {tab === "trades" && (
          <section className="panel p-4">
            <h2 className="text-sm font-bold uppercase tracking-widest">Custom Craft Engine</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Define your own craft titles and how often their qualifications expire.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <span className={label}>Craft title</span>
                <input className={field} value={t.trade_name} onChange={(e) => setT({ ...t, trade_name: e.target.value })} />
              </div>
              <div>
                <span className={label}>Expires every (months)</span>
                <input
                  type="number"
                  min={1}
                  className={field}
                  value={t.recurrence_months}
                  onChange={(e) => setT({ ...t, recurrence_months: Number(e.target.value) || 12 })}
                />
              </div>
            </div>
            <button
              onClick={saveTrade}
              disabled={!t.trade_name}
              className="mt-3 rounded-md bg-primary px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
            >
              Add craft
            </button>
            <ul className="mt-4 space-y-2">
              {trades.map((ct) => (
                <li key={ct.id} className="flex items-center justify-between rounded-md border border-border bg-input px-3 py-2 text-sm">
                  <span>{ct.trade_name}</span>
                  <span className="text-xs text-muted-foreground">{ct.recurrence_months} months</span>
                </li>
              ))}
              {trades.length === 0 && <p className="text-sm text-muted-foreground">No custom crafts yet.</p>}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { get, set } from "idb-keyval";
import { Plus, Pencil, Save, Send, Check, X, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { continuityInput, canReviewContinuity, readLocalWork, writeLocalWork, type LocalWork } from "@/lib/personal-continuity";
import { getPersonalContinuity, savePersonalContinuity, reviewPersonalContinuity, linkContinuityWorker } from "@/lib/personal-continuity.functions";

type LogContext = Awaited<ReturnType<typeof getPersonalContinuity>>;
export function PersonalContinuityLog() {
  const { user, loading } = useAuth();
  const load = useServerFn(getPersonalContinuity);
  const save = useServerFn(savePersonalContinuity);
  const review = useServerFn(reviewPersonalContinuity);
  const linkWorker = useServerFn(linkContinuityWorker);
  const [workerId, setWorkerId] = useState("");
  const [workerEmail, setWorkerEmail] = useState("");
  const qc = useQueryClient();
  const [online, setOnline] = useState(true);
  const [local, setLocal] = useState<LocalWork[]>([]);
  const [editor, setEditor] = useState<LocalWork | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const lock = useRef(false);
  const q = useQuery({ queryKey: ["personal-continuity", user?.id], enabled: !!user, queryFn: async () => {
    if (!user) throw new Error("Sign in to open your log.");
    const cacheKey = `cathy.continuity.context.${user.id}`;
    if (!navigator.onLine) {
      const cached = await get<LogContext>(cacheKey);
      if (!cached) throw new Error("Open your log online once before using it offline.");
      return cached;
    }
    const data = await load();
    try { await set(cacheKey, data); } catch { /* Online reads still work if device storage is unavailable. */ }
    return data;
  }, retry: false, networkMode: "always" });
  const ctx = q.data;
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    setLocal([]); setEditor(null);
    if (ctx?.profile.company_id && user) void readLocalWork(ctx.profile.company_id, user.id).then(setLocal).catch(() => setMessage("Local storage is unavailable. Drafts cannot be saved on this device."));
  }, [ctx?.profile.company_id, user?.id]);
  async function persist(rows: LocalWork[]) {
    if (!ctx?.profile.company_id || !user) throw new Error("Your account is not ready.");
    await writeLocalWork(ctx.profile.company_id, user.id, rows); setLocal(rows);
  }
  async function sync() {
    if (!ctx?.profile.company_id || !user || !navigator.onLine || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      let rows = await readLocalWork(ctx.profile.company_id, user.id);
      const hadQueuedWork = rows.some((r) => r.queued);
      for (const entry of rows.filter((r) => r.queued)) {
        try {
          await save({ data: continuityInput.parse(entry) });
          rows = rows.filter((r) => r.id !== entry.id);
          await persist(rows);
        } catch (e) {
          rows = rows.map((r) => r.id === entry.id ? { ...r, queued: false, error: e instanceof Error ? e.message : "Submission failed. Review and retry." } : r);
          await persist(rows); break;
        }
      }
      await qc.invalidateQueries({ queryKey: ["personal-continuity", user.id] });
      await qc.invalidateQueries({ queryKey: ["continuity-logs"] });
      if (hadQueuedWork && !rows.some((r) => r.error)) setMessage("Work submitted for supervisor approval.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not sync local work."); }
    finally { lock.current = false; setBusy(false); }
  }
  useEffect(() => { if (online && ctx) void sync(); }, [online, ctx?.profile.company_id, user?.id]);
  async function storeDraft(queued: boolean) {
    if (!editor || busy) return;
    try {
      const parsed = continuityInput.parse(editor);
      await persist([...local.filter((r) => r.id !== editor.id), { ...parsed, queued }]);
      setEditor(null); setMessage(queued ? (online ? "Submitting for approval…" : "Queued on this device; approval is pending until reconnect.") : "Draft saved on this device.");
      if (queued && online) await sync();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save your draft."); }
  }
  async function decide(id: string, version: number, status: "approved" | "rejected") {
    setBusy(true); setMessage("");
    try {
      await review({ data: { id, version, status, note: notes[id] ?? "" } });
      await q.refetch(); await qc.invalidateQueries({ queryKey: ["continuity-logs"] });
      setMessage(status === "approved" ? "Approved. Verified continuity evidence has been recorded." : "Returned to the worker for correction.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Review failed."); }
    finally { setBusy(false); }
  }
  if (loading) return <p className="text-muted-foreground">Loading your account…</p>;
  if (!user) return <Link to="/auth"><Button className="touch-target">Sign in to open your log</Button></Link>;
  if (!ctx) return <div role="status"><p>{q.error instanceof Error ? q.error.message : "Loading continuity log…"}</p><Button variant="outline" className="mt-4 touch-target" onClick={() => q.refetch()}>Retry</Button></div>;
  const mine = ctx.entries.filter((e) => e.submitted_by === user.id);
  const pending = ctx.entries.filter((e) => e.status === "pending" && canReviewContinuity(ctx.profile.role, user.id, e.submitted_by, ctx.people.find((p) => p.id === e.personnel_id)?.supervisor_id ?? null));
  const field = "min-h-12 w-full rounded-md border border-input bg-background px-3 text-base text-foreground";
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
      <div><p className="text-muted-foreground">{ctx.person ? `${ctx.person.first_name} ${ctx.person.last_name} · ${ctx.person.employee_id}` : "Personnel record not linked"}</p><p className={online ? "text-success" : "text-warning"}>{online ? "Online" : "Offline · local drafts"}</p></div>
      <div className="flex gap-2"><Button variant="outline" className="touch-target" disabled={busy || !online} onClick={() => sync()}><RefreshCw className="h-4 w-4" />Sync</Button><Button className="touch-target" disabled={!ctx.person || ctx.profile.role === "viewer" || busy} onClick={() => { setMessage(""); setEditor({ id: crypto.randomUUID(), version: 0, cert_type_code: ctx.types[0]?.code ?? "", performed_date: new Date().toISOString().slice(0,10), work_reference: "", standard: "", position: "", queued: false }); }}><Plus className="h-4 w-4" />Log work</Button></div>
    </div>
    {!ctx.person && <p role="alert" className="my-5 text-warning">Ask your company admin to set the same email on your account and one active personnel record.</p>}
    {ctx.profile.role === "company_admin" && <details className="my-5 border-y border-border py-4"><summary className="min-h-12 cursor-pointer font-semibold">Link worker account</summary><form className="space-y-3 py-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await linkWorker({ data: { personnel_id: workerId, email: workerEmail } }); await q.refetch(); setMessage("Worker account linked."); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not link account."); } finally { setBusy(false); } }}><select aria-label="Personnel record" required className={field} value={workerId} onChange={(e) => setWorkerId(e.target.value)}><option value="">Select active worker</option>{ctx.people.filter((p) => p.status === "active").map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} · {p.employee_id}</option>)}</select><Input aria-label="Worker account email" required type="email" maxLength={255} className="min-h-12 text-base" placeholder="Worker's sign-in email" value={workerEmail} onChange={(e) => setWorkerEmail(e.target.value)} /><Button className="touch-target" disabled={!online || busy || !workerId} type="submit">Link account</Button></form></details>}
    {message && <p role="status" className="my-4 break-words text-base text-warning">{message}</p>}
    {editor && <form className="my-6 space-y-4 border-y border-border py-6" onSubmit={(e) => { e.preventDefault(); void storeDraft(true); }}>
      <h2 className="text-2xl font-bold">{editor.version ? "Edit submitted work" : "Work entry"}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2">Process<select aria-label="Process" className={field} value={editor.cert_type_code} onChange={(e) => setEditor({ ...editor, cert_type_code: e.target.value })}>{ctx.types.map((t) => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}</select></label>
        <label className="space-y-2">Performed date<Input aria-label="Performed date" className="min-h-12 text-base" type="date" required max={new Date().toISOString().slice(0,10)} value={editor.performed_date} onChange={(e) => setEditor({ ...editor, performed_date: e.target.value })} /></label>
        <label className="space-y-2 sm:col-span-2">Work / weld reference<Input aria-label="Work reference" className="min-h-12 text-base" required maxLength={500} value={editor.work_reference} onChange={(e) => setEditor({ ...editor, work_reference: e.target.value })} /></label>
        <label className="space-y-2">Qualified standard<Input aria-label="Qualified standard" className="min-h-12 text-base" maxLength={120} value={editor.standard} onChange={(e) => setEditor({ ...editor, standard: e.target.value })} /></label>
        <label className="space-y-2">Position<Input aria-label="Position" className="min-h-12 text-base" maxLength={120} value={editor.position} onChange={(e) => setEditor({ ...editor, position: e.target.value })} /></label>
      </div>
      <div className="flex flex-wrap gap-2"><Button type="submit" className="touch-target" disabled={busy}><Send className="h-4 w-4" />Submit for approval</Button><Button type="button" variant="outline" className="touch-target" disabled={busy} onClick={() => storeDraft(false)}><Save className="h-4 w-4" />Save draft</Button><Button type="button" variant="ghost" className="touch-target" onClick={() => setEditor(null)}>Cancel</Button></div>
    </form>}
    {local.length > 0 && <section className="mt-8"><h2 className="text-2xl font-bold">On this device</h2><ul className="divide-y divide-border">{local.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0 break-words"><p>{r.cert_type_code} · {r.performed_date} · {r.work_reference}</p><p className="text-warning">{r.error ?? (r.queued ? "Queued for approval" : "Local draft")}</p></div><div className="flex gap-2"><Button variant="outline" className="touch-target" disabled={busy} aria-label="Edit local entry" onClick={() => setEditor(r)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" className="touch-target" disabled={busy} aria-label="Discard local entry" onClick={() => { if (window.confirm("Discard this local draft?")) void persist(local.filter((x) => x.id !== r.id)); }}><Trash2 className="h-4 w-4" /></Button></div></li>)}</ul></section>}
    <section className="mt-8"><h2 className="text-2xl font-bold">My submissions</h2>{mine.length === 0 && <p className="mt-3 text-muted-foreground">No work submitted yet.</p>}<ul className="divide-y divide-border">{mine.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0 break-words"><p className="font-semibold">{r.cert_type_code} · {r.performed_date}</p><p>{r.work_reference}</p><p className="text-muted-foreground">{[r.standard, r.position].filter(Boolean).join(" · ")}</p><p className={r.status === "approved" ? "text-success" : "text-warning"}>{r.status === "approved" ? "Approved · verified evidence" : r.status === "rejected" ? "Returned for correction" : "Pending supervisor approval"}</p>{r.review_note && <p className="text-muted-foreground">{r.review_note}</p>}</div>{r.status !== "approved" && <Button variant="outline" className="touch-target" disabled={busy || local.some((x) => x.id === r.id)} onClick={() => setEditor({ id: r.id, version: r.version, cert_type_code: r.cert_type_code, performed_date: r.performed_date, work_reference: r.work_reference, standard: r.standard, position: r.position, queued: false })}><Pencil className="h-4 w-4" />Edit</Button>}</li>)}</ul></section>
    {pending.length > 0 && <section className="mt-8"><h2 className="text-2xl font-bold">Awaiting my approval</h2><ul className="divide-y divide-border">{pending.map((r) => { const p = ctx.people.find((p) => p.id === r.personnel_id); return <li key={r.id} className="space-y-3 py-5"><p className="font-semibold">{p?.first_name} {p?.last_name} · {r.cert_type_code} · {r.performed_date}</p><p className="break-words">{r.work_reference} · {r.standard} · {r.position}</p><Input aria-label={`Review note for ${r.work_reference}`} placeholder="Review note (required for return)" className="min-h-12 text-base" maxLength={1000} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} /><div className="flex flex-wrap gap-2"><Button className="touch-target" disabled={busy || !online} onClick={() => decide(r.id, r.version, "approved")}><Check className="h-4 w-4" />Approve</Button><Button variant="outline" className="touch-target" disabled={busy || !online || !notes[r.id]?.trim()} onClick={() => decide(r.id, r.version, "rejected")}><X className="h-4 w-4" />Return for correction</Button></div></li>; })}</ul></section>}
    <section className="mt-8"><h2 className="text-2xl font-bold">Verified continuity history</h2>{ctx.logs.length === 0 && <p className="mt-3 text-muted-foreground">No verified work recorded.</p>}<ul className="divide-y divide-border">{ctx.logs.map((r) => <li key={r.id} className="py-4"><p className="font-semibold">{r.cert_type_code} · {r.performed_date}</p><p className="break-words text-muted-foreground">{r.work_reference}</p></li>)}</ul></section>
  </>;
}
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { continuityInput } from "@/lib/personal-continuity";

export const getPersonalContinuity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const { data: profile, error } = await db.from("profiles").select("id,company_id,email,role").eq("id", context.userId).single();
    if (error || !profile?.company_id) throw new Error("Your company account is not ready.");
    const { data: people, error: pe } = await db.from("personnel_records").select("id,first_name,last_name,employee_id,email,supervisor_id,status").eq("company_id", profile.company_id);
    if (pe) throw new Error("Could not load personnel records.");
    const matches = (people ?? []).filter((p) => p.status === "active" && p.email?.trim().toLowerCase() === profile.email?.trim().toLowerCase() && !!profile.email);
    const person = matches.length === 1 ? matches[0] ?? null : null;
    const { data: entries, error: ee } = await db.from("continuity_submissions").select("*").eq("company_id", profile.company_id).order("performed_date", { ascending: false });
    const { data: types, error: te } = await db.from("certification_types").select("code,name").eq("requires_continuity", true).eq("is_active", true).order("code");
    if (ee || te) throw new Error("Could not load continuity logs.");
    const { data: logs, error: le } = person ? await db.from("craft_continuity_logs").select("id,cert_type_code,performed_date,work_reference,verified_by").eq("company_id", profile.company_id).eq("personnel_id", person.id).order("performed_date", { ascending: false }) : { data: [], error: null };
    if (le) throw new Error("Could not load verified continuity.");
    return { profile, person, types: types ?? [], entries: entries ?? [], logs: logs ?? [], people: (people ?? []).filter((p) => profile.role === "company_admin" || entries?.some((e) => e.personnel_id === p.id)) };
  });

export const linkContinuityWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ personnel_id: z.uuid(), email: z.email().max(255) }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: me } = await context.supabase.from("profiles").select("company_id,role").eq("id", context.userId).single();
    if (!me?.company_id || me.role !== "company_admin") throw new Error("Only a company admin can link worker accounts.");
    const { data: saved, error } = await context.supabase.from("personnel_records").update({ email: data.email.trim().toLowerCase() }).eq("id", data.personnel_id).eq("company_id", me.company_id).select("id").maybeSingle();
    if (error || !saved) throw new Error("The worker account could not be linked.");
    return { ok: true };
  });

export const savePersonalContinuity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => continuityInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    const { data: profile } = await db.from("profiles").select("company_id,email,role").eq("id", context.userId).single();
    if (!profile?.company_id || !profile.email || profile.role === "viewer") throw new Error("An active worker account is required.");
    const { data: people } = await db.from("personnel_records").select("id,email,status").eq("company_id", profile.company_id).eq("status", "active");
    const matches = (people ?? []).filter((p) => p.email?.trim().toLowerCase() === profile.email?.trim().toLowerCase());
    const person = matches.length === 1 ? matches[0] : null;
    if (!person) throw new Error("Ask your company admin to match your account email to one active personnel record.");
    const { id, version, ...fields } = data;
    if (version === 0) {
      const { data: saved, error } = await db.from("continuity_submissions").insert({ id, ...fields, company_id: profile.company_id, personnel_id: person.id, submitted_by: context.userId }).select("*").single();
      if (!error && saved) return saved;
      if (error?.code === "23505") {
        const { data: existing } = await db.from("continuity_submissions").select("*").eq("id", id).eq("submitted_by", context.userId).single();
        if (existing && Object.entries(fields).every(([k, v]) => existing[k as keyof typeof existing] === v)) return existing;
      }
      throw new Error("Could not submit work. Check your account and connection, then retry.");
    }
    const { data: saved, error } = await db.from("continuity_submissions").update({ ...fields, status: "pending", version: version + 1 }).eq("id", id).eq("company_id", profile.company_id).eq("submitted_by", context.userId).eq("version", version).in("status", ["pending", "rejected"]).select("*").maybeSingle();
    if (error || !saved) {
      // A retry after a lost response is safe only when the accepted version and contents match.
      const { data: existing } = await db.from("continuity_submissions").select("*").eq("id", id).eq("submitted_by", context.userId).single();
      if (existing?.version === version + 1 && Object.entries(fields).every(([k, v]) => existing[k as keyof typeof existing] === v)) return existing;
      throw new Error("This entry changed or was approved. Refresh and review it; your local copy has been kept.");
    }
    return saved;
  });

export const reviewPersonalContinuity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.uuid(), version: z.number().int().min(1), status: z.enum(["approved", "rejected"]), note: z.string().trim().max(1000) }).refine((d) => d.status !== "rejected" || d.note.length > 0, "A rejection reason is required.").parse(input))
  .handler(async ({ context, data }) => {
    // RLS restricts reviewers; the atomic database trigger checks role, tenant,
    // assigned supervisor and independent review, then appends verified evidence.
    const { data: saved, error } = await context.supabase.from("continuity_submissions").update({ status: data.status, review_note: data.note, version: data.version + 1 }).eq("id", data.id).eq("version", data.version).eq("status", "pending").neq("submitted_by", context.userId).select("id").maybeSingle();
    if (error || !saved) throw new Error("Review was not saved. The entry changed or you are not its authorized reviewer.");
    return { ok: true };
  });
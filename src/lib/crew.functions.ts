import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const CREW_ROLES = [
  "company_admin",
  "safety_director",
  "qc_inspector",
  "field_supervisor",
  "operator",
  "field_tech",
  "craftsman",
  "viewer",
] as const;

/**
 * Create a crew account inside the caller's company. Only company admins and
 * super-admins may call this (build rule: only they change roles). The caller's
 * role and company are looked up server-side, never trusted from the client.
 */
export const createCrewMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(255),
        password: z.string().min(10).max(72),
        role: z.enum(CREW_ROLES),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: me } = await context.supabase
      .from("profiles")
      .select("company_id, role, is_super_admin")
      .eq("id", context.userId)
      .single();
    if (!me?.company_id || !(me.is_super_admin || me.role === "company_admin")) {
      return { ok: false as const, message: "Only company admins can add crew." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error || !created.user) {
      return { ok: false as const, message: error?.message ?? "Could not create the account." };
    }
    const { error: pe } = await supabaseAdmin.from("profiles").insert({
      id: created.user.id,
      company_id: me.company_id,
      email: data.email,
      role: data.role,
      is_super_admin: false,
      plan: "free",
    } as never);
    if (pe) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      const seat = /seat/i.test(pe.message);
      return { ok: false as const, message: seat ? "Your plan's seat limit is reached." : pe.message };
    }
    return { ok: true as const };
  });

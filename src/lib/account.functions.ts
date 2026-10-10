import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side account bootstrap. Never changes an existing profile's role.
 * A brand-new self-service signup gets its own empty Free company (company_admin
 * of that company only) — and only after the caller's email is verified.
 * Invited crew already have a profile, so they are never elevated here.
 */
export const bootstrapAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("profiles")
      .select("id, company_id")
      .eq("id", userId)
      .maybeSingle();

    if (!existing?.company_id) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: u, error: ue } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (ue || !u.user) throw new Error("Account not found.");
      if (!u.user.email_confirmed_at) {
        return { ok: false as const, message: "Verify your email before setting up a company." };
      }
      if (existing) {
        // Profile exists without a company: an admin must attach it; never self-provision.
        return { ok: false as const, message: "Ask your company admin to add you to the crew." };
      }
      const email = u.user.email ?? "";
      const { data: company, error: ce } = await supabaseAdmin
        .from("companies")
        .insert({
          name: `${email.split("@")[0] || "new"} Co`,
          subscription_tier: "free",
          subscription_status: "active",
          seat_limit: 1,
        } as never)
        .select("id")
        .single();
      if (ce || !company) throw new Error("Could not set up your company.");
      const { error: pe } = await supabaseAdmin.from("profiles").insert({
        id: userId,
        company_id: (company as { id: string }).id,
        email,
        role: "company_admin",
        is_super_admin: false,
        plan: "free",
      } as never);
      if (pe && pe.code !== "23505") {
        await supabaseAdmin.from("companies").delete().eq("id", (company as { id: string }).id);
        throw new Error("Could not set up your profile.");
      }
      if (pe) {
        // Lost a race with a parallel bootstrap; drop the orphan company.
        await supabaseAdmin.from("companies").delete().eq("id", (company as { id: string }).id);
      }
    }

    await supabase.rpc("rotate_session_token", { _token: crypto.randomUUID() } as never);
    return { ok: true as const };
  });

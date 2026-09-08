import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { bootstrapAccount } from "@/lib/account.functions";

export interface CompanyContext {
  profile: {
    id: string;
    company_id: string | null;
    email: string | null;
    role: string;
    is_super_admin: boolean;
  };
  company: {
    id: string;
    name: string;
    subscription_tier: string;
    subscription_status: string;
    seat_limit: number;
  } | null;
}

async function loadContext(): Promise<CompanyContext | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;

  // Account initialization happens server-side only.
  await bootstrapAccount();


  const { data: profile } = await supabase
    .from("profiles")
    .select("id, company_id, email, role, is_super_admin")
    .eq("id", uid)
    .maybeSingle();
  if (!profile) return null;

  const p = profile as CompanyContext["profile"];
  let company: CompanyContext["company"] = null;
  if (p.company_id) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, subscription_tier, subscription_status, seat_limit")
      .eq("id", p.company_id)
      .maybeSingle();
    company = (data as CompanyContext["company"]) ?? null;
  }
  return { profile: p, company };
}

export function useProfile() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["company-context", session?.user.id],
    queryFn: loadContext,
    enabled: !!session,
  });
  const ctx = query.data ?? null;
  return {
    ...query,
    context: ctx,
    companyId: ctx?.profile.company_id ?? null,
    isPro: (ctx?.company?.subscription_tier ?? "free") !== "free",
    isSuperAdmin: ctx?.profile.is_super_admin ?? false,
    role: ctx?.profile.role ?? "craftsman",
  };
}

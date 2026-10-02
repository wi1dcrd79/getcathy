import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { canonicalSha256 } from "./signatures/canonicalize";

const COMPILE_ROLES = ["company_admin", "safety_director", "qc_inspector"];

/**
 * Compile a new binder version: snapshot the company's equipment, latest
 * inspections and approved certs server-side, seal it with an RFC 8785 hash.
 * The binder-level sign-off (submitSignature with audit_binder_id) verifies
 * against this hash and a DB trigger flips the binder to "signed".
 */
export const compileAuditBinder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile, error: pe } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .single();
    if (pe || !profile?.company_id) throw new Error("No company for this account.");
    if (!COMPILE_ROLES.includes(profile.role)) throw new Error("Your role can't compile audit binders.");
    const cid = profile.company_id;

    const [assets, insps, certs, prev] = await Promise.all([
      supabase.from("assets").select("id, asset_tag, name, status, site, zone, bin, serial_or_vin").eq("company_id", cid).order("asset_tag"),
      supabase
        .from("inspections")
        .select("id, asset_id, inspection_type, inspection_date, expiration_date, result")
        .eq("company_id", cid).eq("status" as never, "final" as never)
        .order("inspection_date", { ascending: false }),
      supabase
        .from("personnel_certs")
        .select("id, personnel_id, cert_name, cert_number, issue_date, expiration_date, approval_status")
        .eq("company_id", cid)
        .eq("approval_status", "approved")
        .order("id"),
      supabase.from("audit_binders").select("version").eq("company_id", cid).order("version", { ascending: false }).limit(1),
    ]);
    for (const r of [assets, insps, certs, prev]) if (r.error) throw new Error(r.error.message);

    const latest = new Map<string, unknown>();
    for (const i of insps.data ?? []) if (!latest.has(i.asset_id)) latest.set(i.asset_id, i);
    const snapshot = {
      company_id: cid,
      equipment: (assets.data ?? []).map((a) => ({ ...a, latest_inspection: latest.get(a.id) ?? null })),
      certifications: certs.data ?? [],
    };
    const content_sha256 = await canonicalSha256(snapshot);
    const version = (prev.data?.[0]?.version ?? 0) + 1;

    const { data: binder, error } = await supabase
      .from("audit_binders")
      .insert({
        company_id: cid,
        version,
        title: `Compliance Audit Binder v${version}`,
        status: "compiled",
        content_sha256,
        compiled_at: new Date().toISOString(),
        created_by: userId,
        snapshot: snapshot as unknown as Json,
      } as never)
      .select("id, version, content_sha256")
      .single();
    if (error) throw new Error(error.message);
    return binder as { id: string; version: number; content_sha256: string };
  });

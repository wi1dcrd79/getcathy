import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAssets from "./tools/list-assets";
import listInspections from "./tools/list-inspections";
import listExpiringCerts from "./tools/list-expiring-certs";

// Issuer must be the direct Supabase host (not the publish-time proxy).
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "c-a-t-h-y",
  title: "C.A.T.H.Y",
  version: "0.1.0",
  instructions:
    "Read-only tools for C.A.T.H.Y. (Compliance, Asset Tracking & Heavy Yards). Results are scoped to the signed-in user's company and role. Use list_assets for yard inventory, list_inspections for inspection history, and list_expiring_certs for lapsed or expiring welder/personnel certifications.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listAssets, listInspections, listExpiringCerts],
});

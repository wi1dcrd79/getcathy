import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAssets from "./tools/list-assets";
import listInspections from "./tools/list-inspections";
import listExpiringCerts from "./tools/list-expiring-certs";
import createInspectionDraft from "./tools/create-inspection-draft";
import createReinspectionTask from "./tools/create-reinspection-task";
import updateTaskStatus from "./tools/update-task-status";
import requestRestrictedAction from "./tools/request-restricted-action";

// Issuer must be the direct Supabase host (not the publish-time proxy).
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "c-a-t-h-y",
  title: "C.A.T.H.Y",
  version: "0.2.0",
  instructions:
    "Tools for C.A.T.H.Y. (Compliance, Asset Tracking & Heavy Yards), scoped to the signed-in user's company and role. Read: list_assets, list_inspections, list_expiring_certs. Drafts (requires the user to grant write_drafts): create_inspection_draft, create_reinspection_task, update_task_status. Signing, binder approval, role/user changes and deletions are never available — request_restricted_action only records and refuses them.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listAssets,
    listInspections,
    listExpiringCerts,
    createInspectionDraft,
    createReinspectionTask,
    updateTaskStatus,
    requestRestrictedAction,
  ],
});

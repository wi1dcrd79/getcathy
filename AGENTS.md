<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Signatures
- Signature rows and images are written only by `submitSignature` (service role) after role/tenant/RFC 8785 hash checks — client INSERT on `signatures` and all client writes to the `signatures` bucket are intentionally absent, so signed evidence can't be forged or overwritten.
- Signed-field lists live in `src/lib/signatures/signed-fields.ts`, shared by client and server — change them in one place or client/server hashes diverge.

## Build Rules (apply to every migration, function, feature)
- Multi-tenancy: every company-scoped table has company_id + RLS; policies use `app_internal.get_current_company_id()`, `current_user_role()`, `is_super_admin()`; own-row checks compare directly to `auth.uid()` — never cross-tenant.
- Roles: only company_admin, safety_director, qc_inspector, field_supervisor, operator, field_tech, viewer, craftsman; only company_admin/super_admin change roles; authority FKs (e.g. supervisor_id) are role-checked in triggers, not just tenant-checked.
- Migrations: idempotent (IF NOT EXISTS, DROP POLICY IF EXISTS, DO $$ guards on constraints); never redeclare objects across files unguarded (caused a real CI failure); extend existing tables instead of forking; no polymorphic record_id — separate nullable FKs + exactly-one CHECK.
- Terminal states (succeeded, permanently_failed, signed) are immutable — corrections spawn new versions; freezes need two triggers: block a second terminal action and block parent UPDATE.
- Secrets live only in Cloud Secrets; `.env` holds VITE_ browser-safe values only.
- Concurrency: atomic conditional UPDATEs over read-then-write; first-claim-wins via partial unique index + catch 23505; batch syncs process in strict order and cascade failures downstream.
- Client timestamps (signed_at, offline_created_at) are display-only; only server-assigned timestamps/sequences decide authoritative order.
- Authority fields (signer_role, role claims) are looked up and stamped server-side, never trusted from the client.
- Hashing: one shared RFC 8785 module client+server; server re-verifies before write; client hash checks are UI-only.
- Storage: check existing bucket policies before reuse; sensitive/immutable artifacts (signatures, compiled binders) get dedicated buckets with server-only writes.
- Lint: the 3 PUBLIC EXECUTE warnings (bootstrap, session rotation, admin replay) are intentional — confirm with the user before changing.

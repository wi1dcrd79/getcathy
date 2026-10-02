# Changes to src/lib/signatures/submit-signature.functions.ts (DRAFT)

Pairs with supabase/migrations/20260930120000_signature_hardening.sql. Apply the migration first.

1. Schema: make signature_png_base64 required (remove .nullish()); validate offline_created_at and
   signed_at with z.string().datetime({ offset: true }).nullish().
2. Add a sanitizeMetadata() whitelist (user_agent, viewport, platform, online; strings capped at 300 chars)
   so image_sha256 and other reserved keys can't come from the client.
3. Capture `snapshot = pickColumns(row, columns)` (the exact object that was hashed) in the generic and
   incident-resolution branches; use {} for audit binders.
4. Replace the existence check, image upload and insert with: upload image, then
   supabaseAdmin.rpc("record_signature", {...}); on error remove the image and map codes:
   23505 -> 409 already signed, SG001 -> 400 record changed, SG002 -> 400 not found, SG003 -> 409 binder state.
5. Remove the old first-signature-wins pre-check; the unique constraints decide.

Before applying: test on a Supabase branch with one signature of each type; regenerate
src/integrations/supabase/types.ts; confirm the signatures bucket is private with no client write policies.

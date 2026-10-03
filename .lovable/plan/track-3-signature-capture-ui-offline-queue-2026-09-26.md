# Track 3 — Signature Capture UI & Offline Queue

Build the field-facing signing experience on top of the verified `submitSignature` server function: a touch-friendly signature pad, sign-off actions on existing record screens, and an offline queue that holds signatures until reconnect.

## What you'll see

- **Signature pad** — a full-width canvas pad (large touch targets, works with gloves/stylus) with Clear and Confirm buttons. Confirming captures the drawing as an image.
- **Sign-off buttons** on records you already manage:
  - Inspections listed on the Audit Binder screen
  - Certifications on the Personnel screen
  - Risk reviews on the Risk Analysis screen
- **Signed state** — once signed, the record shows a "Signed & frozen" stamp with signer role and date; the sign button disappears (first-signature-wins).
- **Offline behavior** — if you're offline, the signature is queued on the device with the exact record snapshot you signed. On reconnect it submits automatically; if the record changed meanwhile or someone signed first, you're told instead of silently overwriting.
- **Role gating** — only company admins, safety directors, QC inspectors, and field supervisors see sign-off buttons (matches the server-side rule).

## How it works

1. **Hash at capture time** — when you tap Sign, the app snapshots the record's signed fields and computes the RFC 8785 canonical hash with the shared `canonicalize.ts` module — the same algorithm the server uses to verify.
2. **Queue when offline** — signature image + payload go into an IndexedDB outbox (`cathy.signature-outbox.v1`), following the existing transfer-queue pattern. An online listener flushes it in order.
3. **Submit when online** — `submitSignature` receives the image plus payload, re-verifies role, tenant, and hash, then stores the image in a dedicated locked-down bucket and writes the signature row.
4. **Outcome handling** — success marks the record signed; 409 (already signed) and 400 (record changed) surface as clear messages and remove the item from the queue; network failures stay queued for retry.

## Technical details

- New: `src/components/certvault/SignaturePad.tsx` (canvas, pointer events, 48px+ targets, dark industrial styling).
- New: `src/lib/signatures/offline-queue.ts` (idb-keyval outbox, flush with per-item outcomes).
- New: `src/lib/signatures/sign-record.ts` (shared client helper: snapshot fields → canonical hash → upload image → submit or enqueue).
- Edits: `src/routes/audit-binder.tsx` (inspection sign-off), `src/routes/personnel.tsx` (cert sign-off), `src/routes/risk-analysis.tsx` (risk review sign-off), plus a queued-signatures indicator on the dashboard.
- Signed-field snapshots mirror the server's `SIGNED_COLUMNS` exactly so client and server hashes agree.
- **Signature images get a dedicated private `signatures` bucket — not `inspection-photos`.** Checked the live storage rules: every `inspection-photos` policy keys on the _first_ folder being the company ID (cast to uuid), so `signatures/<company_id>/...` would fail on upload (and error on the uuid cast). Worse, that bucket has owner-based UPDATE/DELETE, so a signer could overwrite or delete their own signature image after signing — breaking immutability.
- New bucket layout: `<company_id>/<signature_uuid>.png`. No client upload/update/delete policies at all; the image is sent to `submitSignature` and written server-side only after role/tenant/hash checks pass, so the image and signature row are created together. One read policy: company members (and platform owner) can view their own company's folder.
- Server function extended to accept the PNG (size-capped, PNG-only), upload with upsert disabled, and store `sha256` of the image in `device_metadata` for tamper evidence.

## Out of scope (next step after this)

- Binder PDF compilation pipeline (generating the PDF + stamping its `content_sha256`) — binder signing activates once that exists.

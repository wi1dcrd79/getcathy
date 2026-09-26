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
3. **Submit when online** — the signature image is uploaded to private storage under the company folder, then `submitSignature` is called. Server re-verifies role, tenant, and hash before writing.
4. **Outcome handling** — success marks the record signed; 409 (already signed) and 400 (record changed) surface as clear messages and remove the item from the queue; network failures stay queued for retry.

## Technical details

- New: `src/components/certvault/SignaturePad.tsx` (canvas, pointer events, 48px+ targets, dark industrial styling).
- New: `src/lib/signatures/offline-queue.ts` (idb-keyval outbox, flush with per-item outcomes).
- New: `src/lib/signatures/sign-record.ts` (shared client helper: snapshot fields → canonical hash → upload image → submit or enqueue).
- Edits: `src/routes/audit-binder.tsx` (inspection sign-off), `src/routes/personnel.tsx` (cert sign-off), `src/routes/risk-analysis.tsx` (risk review sign-off), plus a queued-signatures indicator on the dashboard.
- Signed-field snapshots mirror the server's `SIGNED_COLUMNS` exactly so client and server hashes agree.
- Signature images stored in the existing private `inspection-photos` bucket under `signatures/<company_id>/...` (company-folder-scoped reads already in place).

## Out of scope (next step after this)

- Binder PDF compilation pipeline (generating the PDF + stamping its `content_sha256`) — binder signing activates once that exists.

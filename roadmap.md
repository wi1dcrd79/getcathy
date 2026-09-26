# C.A.T.H.Y. Roadmap

## Phase 1 — Enterprise architecture (in progress)
- [ ] companies + profiles (company_id, role, is_super_admin, session token)
- [ ] company_id on assets, inspections, location_history, welder/personnel tables
- [ ] personnel_records, personnel_certs, custom_trades tables
- [ ] get_current_company_id() helper + non-recursive RLS on every table
- [ ] Company bootstrap on first sign-in (company + admin profile)
- [ ] Super admin hardcoded for w1dcrd79@gmail.com
- [ ] Free tier: hard limit of 3 assets; seat limit on pro (5)
- [x] Upgrade modal "Field Yard Pro — $279/mo" on limit or locked action
- [x] /super-admin route: list companies, toggle tiers/seats

## Yard / Telxon tracking
- [ ] Asset fields: site, zone, bin, current_location breadcrumb, make_model, serial_or_vin
- [x] Quick Transfer flow (scan asset -> scan/select bin -> confirm)
- [x] Immutable location_history audit trail
- [x] Breadcrumb chips on asset cards, search across serial/stamp/tag/bin

## Compliance engine
- [ ] Welder continuity Active / Grace / Lapsed
- [ ] Rigging & machinery inspection statuses
- [ ] Audit binder PDF (gated behind Pro)

## Track 1 — Inngest & durable execution
- [x] job_failures (admin dead-letter queue), telemetry_syncs, job_locks, compliance_report_jobs tables
- [x] Typed event catalogue + gateway emitter
- [ ] /api/public/inngest serve route
- [ ] Functions: AI hazard analysis, telemetry sync cron, compliance report compilation
- [ ] Dead-letter to crash_reports + admin queue
- [ ] End-to-end test: serve route, event dispatch, function execution, dead-letter logging

## Track 3 — E-signatures & binder versioning
- [x] audit_binders table (versioned, company-scoped RLS, compliance-role writes)
- [x] signatures table (append-only, exactly-one-target, first-signature-wins unique constraints)
- [x] Server-side signature security trigger (role/tenant check, binder hash match, role+sync stamping)
- [x] Parent immutability freezes (binders, inspections, risk assessments, personnel certs)
- [x] Option 1 lockdown: direct client INSERT revoked; inserts only via verified server function
- [x] submitSignature server fn with RFC 8785 canonical hash verification (400/403/409 semantics)
- [ ] Signature capture UI (canvas pad >=48px) + offline signature queue
- [ ] Binder compile pipeline (PDF generation + content_sha256 stamping)

## Track 4 — Offline asset ledger & conflict detection
- [x] asset_ledger table (client-generated UUIDs, chained expected_prior_event_id, company-scoped RLS)
- [x] assets.current_ledger_event_id pointer column
- [x] ledger_conflicts exception table + manager resolve flow
- [x] IndexedDB outbox with intra-device chaining
- [x] Atomic server-side batch sync (unconditional ledger insert, conditional pointer update, cascading conflicts)
- [x] Manager review dashboard for ledger_conflicts (/ledger-conflicts, linked from Admin Console)

## Pending ops
- [ ] Resend: link "Luis's Resend" connection + add RESEND_WEBHOOK_SECRET, then end-to-end cert-email test

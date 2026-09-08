# CertVault Industries Roadmap

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

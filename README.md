# C.A.T.H.Y

Build a production-ready, mobile-first Progressive Web App (PWA) and desktop QA/QC dashboard called "CertVault AI" designed for industrial fabricators, rigging operations, and contractor compliance.

1. DATABASE SCHEMA (Supabase-ready tables):

- assets:

  * id (uuid, primary key)

  * asset_tag (string, unique barcode/serial identifier, e.g. "SHK-5T-092")

  * name (string, e.g. "5-Ton Crosby Screw-Pin Anchor Shackle")

  * category (enum: 'rigging', 'welder_cert', 'heavy_equipment', 'ppe')

  * location (string, e.g. "Bay 3 - Rack B" or "Rig 14")

  * assigned_to (string / user_id, nullable)

  * image_url (text, storage path)

  * created_at (timestamp)

- inspections:

  * id (uuid, primary key)

  * asset_id (foreign key -> assets.id)

  * inspector_name (string)

  * inspection_date (date)

  * expiration_date (date)

  * status (calculated enum: 'Compliant', 'Expiring Soon', 'Out of Compliance')

  * result (enum: 'Pass', 'Fail', 'Needs Service')

  * notes (text)

- welder_qualifications:

  * id (uuid, primary key)

  * welder_name (string)

  * welder_id_stamp (string, e.g. "W-79")

  * process (enum: 'SMAW', 'GTAW', 'GMAW', 'FCAW')

  * standard (string, e.g. "ASME Sec IX / 6G" or "AWS D1.1")

  * continuity_date (date - must be updated every 6 months to stay active)

  * expiration_date (date)

  * status (calculated enum: 'Active', 'Grace Period', 'Lapsed')

2. BUSINESS LOGIC & AUTO-CALCULATIONS:

- Equipment & Rigging Status:

  * If expiration_date > 30 days away -> 'Compliant' (Green badge).

  * If expiration_date between 1 and 30 days -> 'Expiring Soon' (Amber badge).

  * If expiration_date < today OR result == 'Fail' -> 'Out of Compliance' (Red badge).

- Welder Continuity:

  * If last continuity_date is within 6 months -> 'Active'.

  * If between 5 and 6 months without an active weld logged -> 'Grace Period' warning.

  * Over 6 months -> 'Lapsed'.

3. USER INTERFACE & SCREENS:

- Mobile Layout (Field Worker Mode):

  * Sticky bottom action bar with a prominent center "Quick Scan / Log Inspection" button.

  * Quick scan opens device camera or photo upload preview with mock OCR data extraction (simulates reading serial plates, Crosby load ratings, or welder stamps).

  * Filter chips: "All", "Rigging", "Welders", "Overdue / Action Needed".

  * Fast search bar indexing asset tags, stamps, and locations.

- Desktop / Tablet Layout (Safety Manager View):

  * 4 Summary Metric Cards: "Total Tracked Assets", "Active Compliant (Count)", "Expiring in < 30 Days (Count)", "Out of Compliance / Overdue (Count)".

  * Full data table with sorting, search, and export capabilities.

  * "Generate Audit Binder (PDF)" button that formats an official compliance summary ready for OSHA or GC review.

4. UI STYLING & DESIGN:

- Industrial high-contrast dark theme (slate/charcoal #0F172A background, safety warning amber #F59E0B, electric cyan #06B6D4, compliant emerald #10B981).

- Mobile PWA configuration enabled (manifest.json included for "Add to Home Screen").

- Pre-populate with 6 realistic records across rigging shackles, chain slings, a Miller welder, and 2 certified welders.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://getcathy.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f32e5ca4-7ae0-4134-8784-a0c93f72246e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

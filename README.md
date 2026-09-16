# C.A.T.H.Y.

**C.A.T.H.Y. — Compliance, Asset Tracking & Heavy Yards**

A production-ready, mobile-first PWA and desktop QA/QC dashboard for industrial
fabricators, pipe yards, rigging operations, and contractor compliance. C.A.T.H.Y.
tracks rigging and heavy equipment, welder certifications and continuity,
multi-craft personnel records, and yard location movements (site → zone → bin),
and generates printable audit binders for OSHA / GC review.

> Copyright © 2026 C.A.T.H.Y. All Rights Reserved. Proprietary and Confidential.
> See `LICENSE` and `COPYRIGHT.txt`.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, TanStack Start (SSR + server functions), Tailwind CSS v4, shadcn/ui
- **Backend & Auth:** Lovable Cloud (Supabase: PostgreSQL, Row Level Security, Auth, Storage)
- **Payments:** Paddle (Merchant of Record) — sandbox & live
- **PWA:** vite-plugin-pwa (service worker, installable, offline queueing via IndexedDB)
- **Native shell:** Capacitor (Android) — app ID `com.cathy.operations`
- **State & data:** TanStack Query

## Prerequisites

- Node.js 20+ (or [Bun](https://bun.sh) — a `bunfig.toml` is included)
- npm (or bun/pnpm)

## Getting Started

```sh
git clone <this-repository-url>
cd <repository-name>
npm install
npm run dev
```

The dev server starts at `http://localhost:8080`.

> **Note:** The first sign-in auto-provisions a company and profile for the
> signed-in user (`bootstrap_current_user`). The super-admin account is the
> configured admin email only.

## Environment Variables

Environment variables live in `.env` at the project root.

### Public / client-side (required)

```sh
VITE_SUPABASE_PROJECT_ID="<project id>"
VITE_SUPABASE_URL="<project url>"
VITE_SUPABASE_PUBLISHABLE_KEY="<publishable (anon) key>"
```

These are safe to expose to the browser; all data access is enforced by
row-level security on the backend.

### Server-side (managed)

The server functions read their credentials at call time from the hosting
environment (Lovable Cloud) — do **not** put these in `.env` or commit them:

- `PADDLE_SANDBOX_API_KEY` / `PADDLE_LIVE_API_KEY` — Paddle API access
- `PAYMENTS_SANDBOX_WEBHOOK_SECRET` / `PAYMENTS_LIVE_WEBHOOK_SECRET` — Paddle webhook signature verification
- `LOVABLE_API_KEY` — internal gateway key

Never commit real secrets. Public publishable keys are fine in code; everything
else belongs in secret storage.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server (Vite, `http://localhost:8080`) |
| `npm run build` | Production build |
| `npm run build:dev` | Development-mode build (used for prerender checks) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint over the project |
| `npm run format` | Prettier write |

## Testing

There is no unit-test suite configured yet. To validate changes:

```sh
# Typecheck (should pass with no output)
bunx tsgo --noEmit

# Lint
npm run lint

# Production build check
npm run build
```

If you add tests, prefer [Vitest](https://vitest.dev) (`bunx vitest run`) so they
run in the same toolchain as the dev server.

## Project Layout

```
src/
  routes/          # TanStack file-based routes (/, /auth, /personnel, /scan-transfer, /import, /audit-binder, /super-admin, /terms, ...)
  components/      # UI components, including C.A.T.H.Y. domain components (in a legacy-named folder)
  lib/             # Domain logic, compliance calculations, legal copy, *.functions.ts server functions
  integrations/    # Auto-generated backend clients — do not edit by hand
  hooks/           # useAuth, useProfile, usePaddleCheckout, ...
```

`src/routeTree.gen.ts` and everything under `src/integrations/supabase/` are
auto-generated — do not edit them manually.

## Mobile / PWA

- `public/manifest.json` — installable PWA metadata (name: "C.A.T.H.Y. Heavy Yard Operations")
- Service worker registration is production-only (`src/lib/register-sw.ts`)
- Capacitor config lives in `capacitor.config.ts`; wrap with the standard
  `npx cap add android` / `npx cap sync` flow after a production build
- Touch targets are ≥ 48px and safe-area insets are respected for rugged field use

## Sync with Lovable

This repository is connected to Lovable for two-way sync: changes made in the
Lovable editor push here automatically, and commits pushed from your IDE sync
back into Lovable.

## License

Proprietary — see `LICENSE`. C.A.T.H.Y. customers retain ownership of the raw
compliance records they submit; the platform itself is the property of C.A.T.H.Y.

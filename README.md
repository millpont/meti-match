# METI Match

**METI Match** by **Millpont** — matchmaking infrastructure for agricultural and environmental
markets. A role-based grain trading platform: growers and program operators list grain with sustainability
attributes, international buyers browse supply and post bids/RFQs, and both sides negotiate to a
deal. The full build plan lives in [`plans/meti-match/`](plans/meti-match/README.md) — read that first for
what's built, what's next, and open design questions.

> This repo started as **METI Open Match**, a two-sided marketplace for agricultural
> environmental outcomes (carbon/water credits). That code is still present (see
> [Legacy carbon-credit feature](#legacy-carbon-credit-feature) below) but is being superseded by
> METI Match, which runs against its **own, separate Supabase
> project** — not the one `open_match` lives in.
>
> This code was copied in from the `meti-open-deposits` repo and rebranded for METI / Millpont.

## Roles

| Role | Status |
|---|---|
| Grower | ✅ Onboarding (farm profile, practices, optional program affiliation); create/edit offers with per-commodity production data defaults and per-listing overrides (yield incl. units, irrigation, rotation, soil test, third-party verification + uploaded statement); browse/filter bids and respond; per-response chat gated on the listing owner starting communication, full status lifecycle to accepted; resulting contracts + raise disputes; request/cancel program affiliation with a program operator; 30-day stale-listing nudge |
| International Buyer | ✅ Onboarding; standing buyer requirements profile; supply search (commodity/state/certification/quantity filters) + Create RFQ; post/browse/filter bids (commodity, bid type, attributes, destination, quantity); respond to offers, per-response chat + status lifecycle; resulting contracts + raise disputes; 30-day stale-listing nudge |
| Program Operator | ✅ Onboarding; dashboard; create offers for grain the program itself holds (same production-data model as a grower); enroll growers directly or approve/decline grower-initiated affiliation requests; growers list with a read-only reporting rollup (no automatic inventory combination); browse/respond to bids; contracts + disputes |
| Superadmin | ✅ Analytics dashboard; accounts list with freeze/unfreeze (enforced at login and at the API layer, not just the UI); all listings with moderation (remove); all contracts (any role); disputes modeled on GAFTA/FOSFA rules — category-driven arbitration vs. expert determination, tribunal → Board of Appeal tier with a 30-day appeal window, 90-day filing deadline with a time-barred flag (informational policy model, not real arbitrator assignment) |
| Service Provider | ⏳ not scoped — no mockup screen defines this role's fields |

See [`plans/meti-match/05-roadmap.md`](plans/meti-match/05-roadmap.md) for the full
phase breakdown.

## Architecture

```
frontend/            Vite + React + TypeScript (strict) SPA
  src/onboarding/     Role picker + registration wizards (grower/operator/buyer)
  src/grower/         Grower dashboard (offers, browse bids)
  src/buyer/          Buyer dashboard (requirements, supply search, bids/RFQs)
  src/listings/       Shared across roles: response chat + status (ResponseThread),
                       the two-directional responses view (ResponsesPanel), bid browsing
  src/components/     Home.tsx (post-onboarding placeholder for roles without a dashboard yet)
                       + the legacy carbon-credit UI (see below)
backend/              Flask JSON API + Auth0 login; serves the built SPA
  onboarding_routes.py   Self-service account creation (replaces admin-linking)
  offers_routes.py       Supply-side listings (growers, program operators)
  bids_routes.py         Demand-side listings (international buyers)
  responses_routes.py    "Contact Supplier" / "Respond to Bid", status lifecycle, chat
  requirements_routes.py Buyer's standing requirements profile
  match_routes.py        Legacy carbon-credit deal/board/match routes (unwired from the UI)
migrations/           Sequential SQL migrations — see below
seeds/                 Demo data: grain_demo.sql (current) / market_demo.sql (legacy)
Dockerfile            Builds the SPA, then runs gunicorn (one container, port 5000)
copilot/              AWS Copilot → App Runner deploy config
```

- **Data:** a standalone Supabase Postgres project created for this rebuild. `accounts` and
  `auth0_users` are owned here (previously borrowed from METI) because the account/role model —
  self-service registration into one of the roles above — has no equivalent in METI's schema.
  See [`plans/meti-match/01-architecture.md`](plans/meti-match/01-architecture.md)
  for the reasoning.
- **Auth:** Auth0 via Authlib, session-cookie based — same tenant/app registration reused from
  METI, but the post-login behavior differs: a first-time login has `account_id: null` and the
  frontend routes them into the role picker + onboarding wizard, rather than METI's "an admin
  links you in the DB" flow.
- **Admin:** `accounts.role = 'admin'` is the normal check now (was a hardcoded account UUID).
  `SUPERADMIN_ACCOUNT_ID` still exists as an env-var bootstrap fallback for before any admin
  account exists.

## Migrations

Applied in order against METI Match's own Supabase project (`0001`–`0003` apply to
METI's *original* project instead — see the note in each file):

| File | Adds |
|---|---|
| `0004_grain_identity.sql` | `accounts`, `auth0_users`, role profiles (grower/operator/buyer/service provider), `program_enrollments` |
| `0005_grain_listings.sql` | `offers`, `bids`, `listing_responses` |
| `0006_grain_buyer_requirements_and_messages.sql` | `buyer_requirements`, `listing_response_messages` (per-response chat) |
| `0007_program_enrollments_email.sql` | `program_enrollments.grower_email` |
| `0008_commodity_varieties.sql` | `offers.variety` / `bids.variety` (e.g. wheat's Hard Red Winter vs. Soft White) |
| `0009_offer_quality_specs.sql` | `offers.protein_pct` / `moisture_pct_max` / `min_order` |
| `0010_contracts_and_production_data.sql` | `contracts` (created on an accepted response), first cut of `production_data` |
| `0011_production_data_per_commodity.sql` | Reworks `production_data` to one row per (grower, commodity); adds per-offer `override_*` columns |
| `0012_disputes.sql` | `disputes` (reason/description/status against a contract) |
| `0013_enable_rls.sql` | Enables RLS on every table added since `0004` (service-role key still bypasses it — see the note in the file) |
| `0014_updates_batch.sql` | Yield units + verification document paths on `production_data`/`offers`; `accounts.frozen`/`frozen_reason`; GAFTA dispute fields (`category`, `resolution_track`, `tier`, `filing_deadline`, `is_time_barred`, `tribunal_resolution_notes`, `appealed_at`) on `disputes` |
| `0062_environmental_listings.sql` | Carbon & environmental-data bids/offers: `asset_class`, `outcome_type`, `vintage_years`, `source_states`, `source_commodities`, `methodology` (+ `offers.data_attributes`); widens the `bid_type`, `uom` and `quantity_basis` checks |

`seeds/grain_demo.sql` seeds one demo international buyer with a few open bids, so a grower has
real data to browse before every role's UI is built out.

## Local development

```bash
# 1. Database — apply migrations 0004-0014 to METI Match's Supabase project, in order
for f in migrations/00{04,05,06,07,08,09,10,11,12,13,14}_*.sql; do psql "$METI_MATCH_DB_URL" -f "$f"; done
psql "$METI_MATCH_DB_URL" -f seeds/grain_demo.sql   # optional demo data

# 2. Backend  (needs .env with AUTH0_*, DB_*, SUPABASE_*, APP_SECRET_KEY — see .env.example)
#    AUTH0_CALLBACK_URL must be http://localhost:5173/callback (the frontend dev server below),
#    NOT the backend's own port — Auth0 redirects the browser there directly (an absolute URL,
#    so Vite's proxy can't rewrite it), and only :5173 is where the SPA lives. See the comment
#    in frontend/vite.config.ts for the full explanation.
python3 -m venv venv && ./venv/bin/pip install -r backend/requirements.txt
cd backend && PORT=5001 ../venv/bin/python app.py   # http://localhost:5001

# 3. Frontend (dev server proxies /api, /login, /logout, /callback to :5001)
cd frontend && npm install && npm run dev           # http://localhost:5173
```

Log in by clicking through the app at **:5173** (not by visiting :5001 directly) so the OAuth
callback lands back on the SPA instead of the bare backend JSON response.

`npm run typecheck` runs strict `tsc --noEmit`; `npm run build` emits `frontend/dist`, which the
backend serves in production.

## Legacy carbon-credit feature

The original METI Open Match deal/board/match/chat flow (`backend/match_routes.py`,
`frontend/src/components/{Boards,Matches,Admin,ProposeDeal,ChatThread,DealCard,DealModal,Confetti}.tsx`,
`frontend/src/taxonomy.ts`, migrations `0001`–`0003`) is still present but **unwired from the
app's UI** as of the METI Match rebuild — `App.tsx` no longer renders those tabs. It talks
to `open_match`/`open_match_messages` tables that don't exist in METI Match's Supabase project,
so those routes will error if called. Left in place for reference during the rebuild rather than
deleted outright; expect it to be replaced or removed as METI Match's own
offers/bids/responses fully supersede it.

## Deploy (AWS Copilot → App Runner)

Same pattern as METI. One-time setup:

```bash
copilot app init meti-open-match
copilot env init --name production
# fill copilot-secrets.yml from copilot-secrets.example.yml, then:
copilot secret init --cli-input-yaml copilot-secrets.yml
copilot deploy --name meti-open-match --env production
```

`copilot-secrets.example.yml` predates this rebuild — it's missing `SUPABASE_URL` /
`SUPABASE_SERVICE_KEY` (which `backend/sb.py` requires) and still points `DB_*` at METI's
original instance. Update it for METI Match's own Supabase project before deploying.

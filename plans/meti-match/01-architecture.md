# Architecture

## Database: new, self-contained Supabase project

Today, `backend/db.py` / `backend/sb.py` read `accounts` and `auth0_users` from **METI's**
Supabase project — `open_match` is the only table this app owns there; identity/account tables
are borrowed. The new GRAIN Supabase project is a different instance, so those shared tables
don't exist in it.

**Decision: the GRAIN project gets its own `accounts` and `auth0_users` tables**, recreated
(schema below in [02-data-model.md](02-data-model.md)), rather than making the backend talk to
two Supabase projects at once. Reasons:

- This app's registration model is fundamentally different (self-service role picker + wizard,
  not admin-linked), so `accounts` needs a `role` column and role-specific profile tables that
  have no equivalent in METI's schema — it's a genuinely different shape, not a shared one.
- Keeping one Supabase project per app avoids the two-client complexity in `sb.py` (which is
  currently a single-base-URL REST client) and keeps this app's data fully isolated, which was
  already the stated goal for `open_match` vs `meti_match`.
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `DB_*` env vars just point at the new project;
  `sb.py`'s REST-over-PostgREST approach (used because the host's IP isn't on METI's DB
  allow-list) carries over unchanged — confirm whether the new project's allow-list needs the
  same treatment, or whether direct Postgres is viable there instead now that it's a fresh
  project. **OPEN QUESTION**, low-cost to punt: REST works either way, so default to keeping
  `sb.py`'s approach unless someone opts into wiring `psycopg2` back in.

## Auth0: reused as-is, with one behavior change

Keep exactly:
- `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` / `AUTH0_DOMAIN` / `AUTH0_CALLBACK_URL` (same
  tenant/app registration).
- `auth.py`'s Authlib integration, `/login`, `/callback`, `/logout`, `requires_auth`, the
  session-cookie shape, `SESSION_COOKIE_NAME` scoped to this app.
- `/api/me` contract (`authenticated`, `profile`, `account_id`, `account_name`,
  `is_superadmin`/admin flag, `db_unavailable`) — the frontend's existing polling pattern in
  `App.tsx` doesn't need to change shape, just get a `role` field added.

**Change:** `_ensure_auth0_user` currently inserts a row with `account_id = NULL` and stops —
METI's model is "an admin links you later." For GRAIN, a first-time login with no `account_id`
must instead be routed to the **role picker + onboarding wizard** (mockup page 2). Onboarding's
final "Create Account" step is what creates the `accounts` row (with `role`) and the
role-specific profile row, then links `auth0_users.account_id` — replacing the admin-linking
step entirely. `SUPERADMIN_ACCOUNT_ID` generalizes to an admin role check (`accounts.role =
'admin'`), matching the mockup's "Admin User / Super Administrator" (page 17).

## Backend shape

Keep the Flask blueprint pattern (`app.py` registers blueprints; each resource area is its own
`*_routes.py` using `sb.py` + `requires_auth`). New/renamed blueprints, replacing the single
`match_routes.py`:

- `onboarding_routes.py` — role selection, the four registration wizards, profile CRUD.
- `offers_routes.py` — supply-side listings (growers + program operators).
- `bids_routes.py` — demand-side listings / requirements (buyers).
- `responses_routes.py` — "Contact Supplier" / "Respond to Bid" / "Place a Bid", the
  match-status lifecycle, and messages — this is the closest thing to today's
  `match_routes.py`'s express-interest + status + chat logic, generalized to work over both
  offers and bids as the listing side.
- `matching_routes.py` — the scored `Signal Match Results` engine (page 18).
- `contracts_routes.py` — once a response is accepted, a contract row with delivery/status
  tracking (pages 9, 14, 17).
- `production_data_routes.py` — grower production data (basic/advanced sections + % complete,
  page 7).
- `admin_routes.py` — analytics dashboard, user/org/listing management, disputes (page 17).

Each mirrors existing conventions: `_require_account()`, `_num()`/`_as_list()` coercion helpers,
`sb.select/insert/update/delete`, JSON serialization helpers per resource.

## Frontend shape

Keep Vite + React + strict TypeScript. Today's `App.tsx` is a single-page shell with tab-like
internal state (`Boards` / `Matches` / `Admin`). The new app needs **real per-role routing**,
since each role has a distinct dashboard and nav (compare mockup pages 7, 10, 13, 17 — different
sidebars entirely). Introduce a router (`react-router-dom`) with:

- Public routes: `/` (landing, page 2), registration wizards (`/join/grower`,
  `/join/operator`, `/join/buyer`, `/join/service-provider`).
- Authenticated, role-gated routes: `/grower/*`, `/operator/*`, `/buyer/*`, `/admin/*`, each with
  its own sidebar/shell component (mirroring pages 7, 10, 13, 17's distinct left-nav items) and
  redirecting a logged-in user to their own role's root if they hit another role's path.
- A shared `/marketplace` hub (page 6) reachable by any authenticated role.

See [04-frontend-plan.md](04-frontend-plan.md) for the full route/component map.

## What's explicitly NOT changing

- Deploy pattern (`Dockerfile`, AWS Copilot → App Runner) — same shape, new env vars/secrets for
  the new Supabase project.
- The general philosophy of `sb.py` (PostgREST client, read-modify-write for array/jsonb columns)
  — fine at this app's scale, same as today's justification.

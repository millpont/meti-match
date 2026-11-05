# Roadmap

Phased so each phase ships something demoable against a specific mockup page, and later phases
depend only on earlier ones (no forward references).

## Phase 0 — Foundation
- Wire env vars for the new Supabase project (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DB_*`);
  keep `AUTH0_*` pointed at the existing tenant.
- `migrations/0001_grain_marketplace.sql`: `accounts`, `auth0_users` (recreated fresh, per
  01-architecture.md), the four role profile tables, `program_enrollments`.
- Update `auth.py`: `_ensure_auth0_user` unchanged in shape; add the "no account yet → send to
  onboarding" branch in `/api/me` consumption (frontend-side, see Phase 1) and generalize
  `is_superadmin()` to an `accounts.role = 'admin'` check.
- **Exit criterion:** a real Auth0 login round-trips against the new DB and `/api/me` returns
  `account_id: null` for a first-time user.

## Phase 1 — Landing + registration (pages 2–5)
- `/` landing page with role picker.
- `onboarding_routes.py` + the three well-specified wizards (grower, operator, buyer) end to end
  (frontend wizard UI + backend create endpoints).
- Service Provider wizard deferred until its fields are scoped (00-overview.md open question) —
  land the landing-page tile linking to a "coming soon" placeholder rather than blocking this
  phase on it.
- **Exit criterion:** all three specified roles can self-register and land on a (still-empty)
  role dashboard.

## Phase 2 — Grower core loop (pages 7, 8, 9)
- `offers_routes.py`, `bids_routes.py` (read-only browse side for growers).
- `/grower` dashboard, `/grower/offers` (create + table), `/grower/bids` (browse + respond).
- `responses_routes.py` far enough to support "respond to a bid" and see it land in "My Bids"
  equivalent.
- **Exit criterion:** a grower can create an offer and respond to a buyer's bid; both are
  visible to the counterparty.

## Phase 3 — Buyer core loop (pages 13, 14, 15, 16)
- `/buyer` dashboard, `/buyer/requirements`, `/buyer/supply` (search/filter offers), `/buyer/bids`
  (respond to/browse own bid responses), RFQ creation from the supply search.
- Full `responses_routes.py` status lifecycle + `listing_response_messages` chat, reusing
  `ChatThread.tsx`.
- **Exit criterion:** a buyer can browse supply, contact a supplier or place a bid, negotiate via
  chat, and reach `accepted`.

## Phase 4 — Program Operator loop (pages 10, 11, 12)
- `program_enrollments` management UI (`/operator/growers`), reuse of `OfferForm`/
  `BidBrowseTable` from Phase 2 parameterized for operator-created listings (aggregated +
  own-production volumes).
- **Exit criterion:** a program operator can enroll a grower and post an aggregated offer.

## Phase 5 — Marketplace hub + scored matching (pages 6, 18)
- `/marketplace` two-column Offers/Bids hub.
- `matching_routes.py`'s scored preview + rationale UI (`MatchScoreRing`), wired into both the
  grower's "explore bids" and buyer's "my bids" detail views.
- Resolve the "counterparty reliability" open question (03-api-plan.md) before scoring goes live;
  ship with a flat placeholder score component if unresolved, clearly not blocking the rest of
  the phase.
- **Exit criterion:** a listing owner sees ranked, scored counterparties instead of an
  unranked filtered list.

## Phase 6 — Contracts + production data
- `contracts_routes.py`, auto-created on `accepted` responses; `/grower/production-data`,
  `/buyer/contracts`.
- Resolve the "advanced production data fields" open question (02-data-model.md) before this
  phase starts.
- **Exit criterion:** an accepted response produces a contract with delivery status tracking.

## Phase 7 — Admin analytics (page 17)
- `admin_routes.py`'s dashboard aggregate + management tables (`DataTable` reused across all of
  them), disputes surface (scope fields first — open question in 03-api-plan.md).
- **Exit criterion:** admin dashboard shows real GMV/volume/transaction/active-user stats
  computed from live data, matching page 17's layout.

## Ongoing, cutting across phases
- Keep `frontend/src/types.ts` and `backend/*_routes.py` DEAL_COLUMNS-style column lists in sync
  as each table lands — same discipline as today's `Deal` type mirroring `open_match`'s columns.
- `npm run typecheck` and a manual click-through of the phase's new screens before calling a
  phase done, per this repo's existing UI-testing expectation.

# API plan

Flask blueprints, replacing the single `match_routes.py`. All routes keep today's conventions:
`@requires_auth`, `_require_account()`-style helpers, JSON error shape `{"error": "..."}`,
`sb.py` for all data access.

## `onboarding_routes.py`

- `GET /api/onboarding/status` — for a logged-in user with no account yet: nothing to return
  beyond what `/api/me` already gives (`account_id: null`); the frontend uses that to show the
  role picker.
- `POST /api/onboarding/grower` / `/operator` / `/buyer` / `/service-provider` — each creates the
  `accounts` row (`role` fixed per endpoint) + the matching profile table row + links
  `auth0_users.account_id`, in one transaction-equivalent (a few sequential `sb.insert`/`sb.update`
  calls, same pattern as today's multi-step writes). Body shape = that role's wizard fields from
  02-data-model.md.
- `GET/PATCH /api/profile` — role-aware: reads `session`'s account role, reads/updates the
  matching profile table. Powers "My Profile" / "Company Profile" screens.

## `offers_routes.py` (growers + program operators)

- `POST /api/offers` — create (draft or published, `status` in body). Validates commodity,
  volume, at least one of price fields; mirrors `_validate_deal`'s shape.
- `PATCH /api/offers/<id>` — edit own offer (only while `status='draft'` or by the creator).
- `GET /api/offers` — public board query with filters (`commodity`, `state`, `certifications`,
  `attributes`, `practices`, `volume_min/max`) — mirrors today's `approved_deals` filter style.
- `GET /api/offers/mine` — "Your Offers" table (page 8).
- `POST /api/offers/<id>/withdraw`.

## `bids_routes.py` (international buyers)

- `POST /api/bids`, `PATCH /api/bids/<id>`, `POST /api/bids/<id>/close`.
- `GET /api/bids` — public board, same filter shape as offers but on bid fields
  (`bid_type`, `destination_country`, `delivery_window`).
- `GET /api/bids/mine`.
- `GET/PUT /api/buyer-requirements` — the standing "My Requirements" profile (page 13), distinct
  from posting a specific bid.

## `responses_routes.py` (generalizes today's express-interest/status/chat)

- `POST /api/offers/<id>/respond` and `POST /api/bids/<id>/respond` — both create a
  `listing_responses` row (`listing_type` set accordingly). Rejects responding to your own
  listing (kept from today's `express_interest` fix). Body: `proposed_price`,
  `proposed_volume` (optional counter).
- `GET /api/responses` — "My Bids" (buyer, page 14) / "Your Offers" responses (grower) — same
  dual-perspective shape as today's `user_matches` (`is_creator` vs not).
- `POST /api/responses/<id>/status` — creator-only status transitions, same `VALID_STATUSES`
  shape (`in-communication`, `in-negotiation`, `accepted`→triggers contract creation, `declined`).
- `GET /api/responses/<id>/messages`, `POST /api/responses/<id>/messages` — same shape as
  today's `list_messages`/`post_message`, keyed by `response_id` instead of `(deal_id, party)`.

## `matching_routes.py` (Signal Match Results, page 18)

- `GET /api/matching/preview?listing_id=&listing_type=` — ranked candidate counterparties for
  one of *my* listings, each with a `match_score` (0–100) and a rationale breakdown
  (`location_match`, `delivery_window_overlap`, `quality_spec_match`, `counterparty_reliability`)
  matching page 18's checklist UI. Scoring approach (first pass, tunable):
  - Location match (state/region overlap): 25 pts
  - Delivery window overlap (days overlapping / days requested): 25 pts
  - Quality/attribute match (required attributes present, commodity match): 30 pts
  - Counterparty reliability (placeholder: completed-contracts count, or flat 20 until real
    reputation data exists): 20 pts
  - **OPEN QUESTION:** "seller reliability" in the mockup implies a reputation/history signal —
    define its source (contract completion rate?) before Phase 5.
- `POST /api/matching/<candidate_response_id>/bid` — same as `responses_routes`'s respond
  endpoint, just entered from the match-results screen with `match_score` stamped onto the
  created `listing_responses` row.

## `contracts_routes.py`

- `GET /api/contracts` — role-scoped (buyer sees their purchases, grower/operator sees their
  sales, admin sees all).
- `PATCH /api/contracts/<id>/status` — pending → shipped → completed.

## `production_data_routes.py`

- `GET/PUT /api/production-data/basic`, `GET/PUT /api/production-data/advanced` — grower-only,
  drives the "Production Data Progress" bars (page 7). Field shape TBD (see 02-data-model.md open
  question).

## `admin_routes.py`

- `GET /api/admin/dashboard` — aggregate stats for page 17: total volume, GMV, transaction
  count, active buyers/sellers (windowed, e.g. last 30 days vs prior 30), volume-by-state.
  Computed by querying `offers`/`bids`/`contracts` and grouping — no new tables needed beyond
  what's in 02-data-model.md.
- `GET /api/admin/users`, `GET /api/admin/organizations`, `GET /api/admin/listings`,
  `GET /api/admin/contracts` — management tables, same pagination/filter style as the buyer
  supply search (page 15/16).
- `DELETE /api/admin/listings/<id>` — takedown, same as today's `remove_deal`.
- `GET/POST /api/admin/disputes` — new surface (page 17 sidebar shows "Disputes"); no mockup
  detail beyond the nav item. **OPEN QUESTION:** scope dispute fields/workflow before Phase 7.

## Carried over unchanged

- `auth.py`'s `/login`, `/callback`, `/logout`, `/api/me` (role field added to the JSON, per
  01-architecture.md).

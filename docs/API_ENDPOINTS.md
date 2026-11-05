# API Reference

This is the backend's JSON API (Flask, `backend/`). It is a **session-cookie-authenticated API
for this app's own SPA**, not a public/token API — there is no API key or bearer-token auth.
Login happens through an Auth0 redirect flow (`GET /login` → Auth0 → `GET /callback`), which sets
a server-side Flask session cookie; every `/api/...` route below (except where noted) requires
that cookie via the `@requires_auth` decorator (`backend/auth.py`), which returns
`401 {"error": "authentication required"}` if missing, and `403 {"error": "account suspended",
"frozen": true}` if the account has been frozen by an admin.

**CSRF protection** (Flask-WTF `CSRFProtect`) is active globally on all state-changing requests
(POST/PUT/PATCH/DELETE) except `/login`/`/callback`/`/logout`. The SPA reads the token from the
`csrf_token` cookie (set on every response) and sends it back as a header — a non-browser API
client must do the same.

No blueprint declares a Flask `url_prefix` (see `backend/app.py`) — every route's full path is
whatever is shown below, exactly as written in its own module.

## Table of contents

- [Auth & session](#auth--session) — `auth.py`
- [Onboarding & roles](#onboarding--roles) — `onboarding_routes.py`
- [Profile](#profile) — `profile_routes.py`
- [Taxonomy](#taxonomy) — `taxonomy_routes.py`
- [Grower inventory](#grower-inventory) — `inventory_routes.py`
- [Production data](#production-data) — `production_data_routes.py`
- [Carbon & environmental-data listings](#carbon--environmental-data-listings) — `environmental.py`
- [Offers (supply listings)](#offers-supply-listings) — `offers_routes.py`
- [Bids (demand listings / RFQs)](#bids-demand-listings--rfqs) — `bids_routes.py`
- [Responses & chat](#responses--chat) — `responses_routes.py`
- [Contracts & disputes](#contracts--disputes) — `contracts_routes.py`
- [Buyer representation (Trader ↔ Buyer)](#buyer-representation-trader--buyer) — `representations_routes.py`
- [Buyer requirements](#buyer-requirements) — `requirements_routes.py`
- [Program enrollments (Operator ↔ Grower)](#program-enrollments-operator--grower) — `enrollments_routes.py`
- [Matching (Signal Match Results)](#matching-signal-match-results) — `matching_routes.py`
- [Service Provider marketplace](#service-provider-marketplace) — `service_requests_routes.py`
- [Notifications](#notifications) — `notifications_routes.py`
- [Company join requests](#company-join-requests) — `company_routes.py`
- [Attribute requests](#attribute-requests) — `attribute_requests_routes.py`
- [Counties](#counties) — `counties_routes.py`
- [Admin](#admin) — `admin_routes.py`
- [Legacy: carbon/ag-outcomes "Deals" board](#legacy-carbonag-outcomes-deals-board) — `match_routes.py`
- [Misc](#misc)

---

## Auth & session

`backend/auth.py`

### `GET /login`
No auth required. Redirects to Auth0's hosted login (`prompt=login` forces the login screen even
if Auth0 has an existing session). `?clear_session=1` clears the Flask session first.

### `GET /callback`
No auth required (this *is* the login completion). Exchanges the Auth0 authorization code,
fetches the userinfo, creates an `auth0_users` row on first login (`account_id` NULL until
onboarding), and populates the session: `profile`, `account_id`, `account_name`, `role` (the
account's primary/active role), `roles` (every role the account holds), `frozen`/`frozen_reason`.
A DB failure here is flagged via `session["db_unavailable"] = True` rather than silently treating
the user as logged out. Redirects back into the SPA (`APP_BASE`).

### `GET /logout`
No auth required. Clears the Flask session (local logout only — does not federate-logout of the
upstream Google/Auth0 session) and redirects to `APP_BASE`.

### `GET /api/me`
No `@requires_auth` — returns `{"authenticated": false}` (200) if there's no session profile,
rather than a 401, so the SPA can poll this on every page load to decide what to render. When
authenticated, re-resolves `account_id`/`role`/`is_company_admin`/`role_switching_enabled` fresh
on every call (not purely session-cached) so a superadmin's action elsewhere (approving a join
request, freezing an account, toggling role-switching) is reflected without a re-login. Response:
`authenticated`, `profile` (Auth0 userinfo subset), `account_id`, `account_name`, `role`, `roles`
(array), `is_superadmin`, `is_company_admin`, `role_switching_enabled`, `pending_join_request`
(non-null only when logged in with no account yet and a join request is awaiting approval),
`frozen`, `frozen_reason`, `db_unavailable`.

---

## Onboarding & roles

`backend/onboarding_routes.py`. `JOINABLE_ROLES = (grower, program_operator,
international_buyer, service_provider)` — `admin` is never self-service.

### `POST /api/onboarding/grower` / `/api/onboarding/operator` / `/api/onboarding/buyer` / `/api/onboarding/service_provider`
Auth required (any logged-in Auth0 login with no account yet). Body: `name`, `company`,
`ein_last4` (exactly 4 digits), `phone`, `email` — all required. 400 if this Auth0 login already
has an account (`"account already exists"`). Creates the `accounts` row (role fixed by which
endpoint was called), seeds `account_roles`, links `auth0_users.account_id`, marks this login as
the company's `is_company_admin` (first person to claim a company name becomes its admin), and
creates the minimal role-specific profile row (`grower_profiles` / `program_operator_profiles` /
`international_buyer_profiles` / `service_provider_profiles`). Response: `{success, account_id,
role}`.

### `POST /api/roles`
Auth required. Adds an extra role to an **already-onboarded** account (e.g. a Program Operator
that's also a Trader). Gated on `role_switching_enabled` for this account (superadmin opt-in per
account, re-checked from the DB every call — see Admin below) — 403 if not enabled. Body: `role`
(must be one of `JOINABLE_ROLES`, and not already held — 400 otherwise). Creates that role's
profile row and immediately switches the session to it. Response: `{success, role, roles}`.

### `GET /api/onboarding/companies`
Auth required (even an account-less login). Query: `q` (name search, ≥2 chars, up to 20 matches)
or `role` (browse all companies already holding that role, up to 50, alphabetical) — neither
present returns an empty list. Response: `{success, companies: [{id, name, roles: [...]}]}`.

### `POST /api/onboarding/join`
Auth required, no existing account yet (400 otherwise). Body: `account_id` (an existing company),
`role` (must be a role that company already holds — 400/404 otherwise). 400 if this login already
has a pending join request. Creates an `account_join_requests` row and notifies the target
account (its company admin sees it — see Company join requests below). Response: `{success}`.

### `POST /api/switch-role`
Auth required. Changes which role is ACTIVE for *this session only* (not persisted — next login
starts back on the primary role). Same `role_switching_enabled` gate as `/api/roles`. Body:
`role` — must be one the account already holds (400 otherwise, `"you don't have this role"`).
Response: `{success, role}`.

---

## Profile

`backend/profile_routes.py`. Account-level fields (photo, bio, links, contact-visibility,
gallery) shared identically across all 4 roles.

### `GET /api/profile`
Auth required. Returns the caller's own profile. `?summary=1` skips the gallery-photos lookup
(each photo needs its own signed-URL round trip) for a lightweight caller that doesn't render it.
Response `profile`: `account_id`, `role`, `name`, `photo_url` (signed, 1hr expiry), `bio`,
`website_url`, `links` (`[{label, url}]`), `gallery_photos` (`[{id, url, caption}]`),
`contact_visible`, `contact_name`, `contact_phone`, `contact_email`, and (service_provider only)
`services_offered`, `states_covered`.

### `PUT /api/profile`
Auth required. Body: any of `bio`, `website_url` (bare domains like `example.com` are normalized
to `https://example.com`), `links`, `contact_visible` (bool), `contact_name`, `contact_phone`,
`contact_email`; a `service_provider` account may also send `services_offered`/`states_covered`
(ignored for other roles). 400 if nothing recognized was sent. Company `name` itself is immutable
here (it's the historical match key for company-join-requests).

### `POST /api/profile/photo` (multipart)
Auth required. Field `file` — one of jpg/jpeg/png/webp/gif, 5MB max. Replaces the single avatar
in place. 400 on bad extension/size, 502 on storage failure.

### `DELETE /api/profile/photo`
Auth required. Removes the avatar (storage delete failures are logged and swallowed — the DB
field is cleared regardless).

### `POST /api/profile/gallery-photos` (multipart)
Auth required. Field `file` (same constraints as the avatar) + optional form field `caption`.
Additive — adds one photo to the gallery (does not replace).

### `DELETE /api/profile/gallery-photos/<photo_id>`
Auth required. Only the owning account may delete (403 otherwise).

### `GET /api/accounts/<account_id>/public-profile`
Auth required (any authenticated account, not just the owner). Read-only view of someone else's
profile. `contact_name`/`contact_phone`/`contact_email` are included **only if that account has
set `contact_visible = true`** — otherwise those keys are entirely absent from the response, not
nulled. Also includes `reputation` (see `reputation.py` — on-time completed-contract rate).

---

## Taxonomy

`backend/taxonomy_routes.py`. Superadmin-managed vocabulary for offer/bid/requirement pickers.
`VALID_TYPES = (attribute, practice, certification, data_requirement, service_category)`.

### `GET /api/taxonomy`
Auth required (any role — every role needs these lists). Query: optional `type` filter (400 if
not a valid type). Response: `{success, terms: [{id, type, label, definition}]}`, alphabetical.

### `POST /api/admin/taxonomy`
**Superadmin only** (`is_superadmin()` — 403 otherwise). Body: `type`, `label` (required),
`definition` (optional). 400 on invalid type, empty label, or a duplicate `(type, label)` pair
(`"a {type} term named "{label}" already exists"`).

### `PATCH /api/admin/taxonomy/<term_id>`
Superadmin only. Body: `label` and/or `definition`. 400 if nothing to update or label is emptied
out; 404 if the term doesn't exist.

### `DELETE /api/admin/taxonomy/<term_id>`
Superadmin only.

---

## Grower inventory

`backend/inventory_routes.py`. A farm-level cap per `(commodity, marketing_year)`, drawn down
live (nothing decremented/stored) by the holder's own non-withdrawn offers **and** their
non-declined responses to a bid — two independent pools: grain volume (bushels/MT) and acres.
Despite the module name, a `program_operator` can hold inventory too (they can create offers
directly for their own grain).

### `GET /api/grower-inventory`
Auth required; role must be `grower` or `program_operator` (403 otherwise). Lists every inventory
row for the caller, each annotated with a live-computed `remaining_volume`/`remaining_acres`
(`null` means no cap — nothing committed against a nonexistent pool is blocked).

### `GET /api/grower-inventory/remaining`
Same role gate. Query: `commodity`, `marketing_year` (both required, 400 otherwise),
`quantity_basis` (`grain` default, or `acres`). Used by `OfferForm`/the respond-with-amount popup
to preview capacity before submitting. Response: `{remaining_volume, remaining_acres, uom,
area_unit}` (the non-applicable pair is always `null`).

### `PUT /api/grower-inventory/<commodity>/<marketing_year>`
Same role gate. Body: `quantity_basis` (`grain` default), then either `{uom, total_volume}`
(grain) or `{area_unit, total_acres}` (acres) — upserts on
`(account_id, commodity, marketing_year, quantity_basis)`. 400 on invalid enum or a missing/
negative total.

### `DELETE /api/grower-inventory/<commodity>/<marketing_year>`
Same role gate. Query: `quantity_basis`. 404 if no such row. **400 if anything is currently
committed against it** (`"You have {n} {unit} committed to listings/responses for {commodity}
{marketing_year} — withdraw those first before deleting this inventory."`) — withdraw/decline
the offers/responses first.

---

## Production data

`backend/production_data_routes.py`. Per-commodity practice/yield data
(`Corn`/`Soybeans`/`Sorghum`/`Wheat`, fixed set) for growers and program operators — an individual
offer can override any field just for that listing (see `override_*` columns in Offers below).

### `GET /api/production-data`
Auth required; role must be `grower` or `program_operator`. Returns all 4 commodities always (an
unused one just reads as 0% complete), each with `advanced_completion_pct`,
`actual_yield_per_acre`, `yield_unit`, `irrigation_type`, `crop_rotation_years`,
`soil_test_on_file`, `third_party_verified`, `input_usage_notes`, `conservation_practices`,
`sustainability_attributes`, `specialty_attributes`, and document flags/signed-URLs for the
verification and soil-test documents.

### `PUT /api/production-data/<commodity>`
Same role gate. 400 if `commodity` isn't one of the 4, or `irrigation_type`/`yield_unit` isn't a
valid enum value. Full upsert of the row (every field replaced, not merged).

### `POST /api/production-data/<commodity>/verification-document` / `.../soil-test-document` (multipart)
Same role gate. Field `file`, 10MB max, any extension. Uploads and attaches to this
commodity's row.

### `DELETE /api/production-data/<commodity>/verification-document` / `.../soil-test-document`
Same role gate. Removes the attached document (storage errors are logged and swallowed).

---

## Carbon & environmental-data listings

Bids and offers aren't grain-only. Both `POST /api/bids` and `POST /api/offers` accept
`asset_class: "carbon" | "environmental"` (omitted = `grain`, unchanged behavior below), modeled on
meti-v2's Match page outcomes. The catalog lives in `backend/environmental.py` (mirrored in
`frontend/src/listings/environmental.ts`); schema in `migrations/0062_environmental_listings.sql`.

| `outcome_type` | Asset class | Stored `commodity` | Unit |
|---|---|---|---|
| `reductions_t` | carbon | Carbon Reductions | tCO2e |
| `removals_t` | carbon | Carbon Removals | tCO2e |
| `ci_commodity_t` | carbon | Low-CI Commodity | MT |
| `water_quantity` | environmental | Water Savings | acre-ft |
| `water_quality_n` | environmental | Avoided Nitrate | lbs |
| `water_quality_p` | environmental | Avoided Phosphate | lbs |
| `water_quality_tss` | environmental | Avoided Sediment | lbs |
| `acres` | environmental | Field-Level Environmental Data | acres |

Shared request fields: `outcome_type` (required, must belong to `asset_class`), `vintage_years`
(required, four-digit years), optional `source_states`, `source_commodities`, `methodology`,
`delivery_window_start`/`_end`. Quantity is in the outcome's unit and prices are USD per that unit.

- **Bid:** `quantity`, `bid_price_usd_per_mt` (per unit), `required_practices`,
  `required_certifications`, `required_data_requirements`, `allow_partial`, `status`. Stored with
  `bid_type: "environmental_outcome"`.
- **Offer:** `expected_volume`, `desired_price`, `min_order`, `practices` (stored as the listing's
  practice override), `certifications`, `data_attributes`, `status`. Stored with
  `quantity_basis: "outcome"` and `uom` = the outcome unit. No production data, inventory
  draw-down, aggregation or on-behalf listing.

Both browse endpoints take `asset_classes` and `vintage_years` (comma-separated). Responding to a
carbon/environmental bid never checks grower inventory. `outcome_type`, `vintage_years` and
`asset_class` are immutable after creation; `methodology` and `source_commodities` are editable.

## Offers (supply listings)

`backend/offers_routes.py`. Growers and program operators. Two orthogonal segmentation axes:
`quantity_basis` (`grain` — a volume in bushels/MT — or `acres` — volume computed server-side
from acres × yield rate) and `listing_timing` (`available` or `future`).

### `POST /api/offers`
Auth required; role must be `grower` or `program_operator` (403 otherwise). Required:
`commodity`; `expected_volume` (grain basis) or `acres_offered` + `yield_rate` + `yield_unit`
(acres basis, volume is computed server-side via `units.yield_to_volume`, never trust a
client-sent volume for this basis); `expected_delivery_date` if `listing_timing=future`.
Enum-validated: `price_type`, `override_irrigation_type`, `override_yield_unit`, `status`
(draft/published/accepted/withdrawn), `quantity_basis`, `listing_timing`, `uom`, `area_unit`,
`yield_unit`.

**On-behalf-of listings**: a `program_operator` may pass `on_behalf_of_grower_account_id` to list
on an actively-enrolled grower's behalf — requires an active enrollment (400/"not actively
enrolled" otherwise) and is capped by that grower's *remaining enrolled acres*
(`enrollments_routes.remaining_enrolled_acres`); forced to `status=draft`,
`grower_approval_status=pending` regardless of the requested status, and notifies the grower.

**Inventory cap**: a grower/operator's own (non-on-behalf-of) listing with a `marketing_year` is
checked against their Grower Inventory remaining balance for that commodity/basis — 400 if it
would exceed (`"This exceeds your remaining {commodity} inventory..."`) — no error if they simply
haven't set up inventory for it yet (soft cap).

Also accepts the full attribute/cert/location set (`sustainability_attributes`,
`specialty_attributes`, `locations`, `certifications`) and the per-listing `override_*`
production-data fields (tri-state: omitted/null = inherit the grower's commodity default; an
explicit value, including an empty list, is a real override). Response: `{success, offer}`.

### `GET /api/offers/mine`
Auth required. Every offer the caller created (any status), newest first, each including
`on_behalf_of_grower_name` when applicable.

### `GET /api/offers/pending-approval`
Auth required; `grower` role only (403 otherwise). Offers a program operator wants to list on
this grower's behalf, awaiting approval, each with `operator_name`.

### `POST /api/offers/<offer_id>/approve` / `POST /api/offers/<offer_id>/decline`
Auth required. Only the grower the offer is on-behalf-of may act (403 otherwise), and only while
`grower_approval_status=pending` (400 otherwise). Approve → `status=published`; decline →
`status=withdrawn`. Notifies the operator either way.

### `GET /api/offers` (browse)
Auth required (any role). Query filters: `commodities`, `states`, `certifications`, `attributes`
(matches either sustainability or specialty attributes), `practices` (matched against the
*resolved* conservation practices, post-override), `quantity_min`/`quantity_max`,
`quantity_basis`. Only `status=published` listings. Each result includes `production` (resolved
production-data view), `has_active_negotiation` (any response reached `in-negotiation`),
`remaining_volume` (total minus already-accepted-response volume — supports partial
fulfillment across multiple accepted responses), and `created_by_name`. Batched (not
per-row-queried) for performance at scale.

### `PATCH /api/offers/<offer_id>`
Auth required; only the creator (403 otherwise). **Immutable once created** (400 listing which
fields were rejected): `commodity`, `quantity_basis`, `listing_timing`, `expected_volume`, `uom`,
`acres_offered`, `area_unit`, `yield_rate`, `yield_unit`, `marketing_year` — withdraw and
recreate instead. Editable: `variety`, `price_type`, `desired_price`, `protein_pct`,
`moisture_pct_max`, `min_order`, `harvest_start`/`harvest_end`, `expected_delivery_date`,
attribute/cert/location lists, `override_conservation_practices`.

### `POST /api/offers/<offer_id>/withdraw`
Auth required; only the creator. Sets `status=withdrawn` — frees any inventory/enrollment cap
this offer was counted against.

### `POST /api/offers/<offer_id>/touch`
Auth required; only the creator. Bumps `updated_at` only (the "still interested?" nudge in
`MyOffersTable` — confirms a stale-looking listing is still valid).

### `POST` / `DELETE /api/offers/<offer_id>/verification-document` and `.../soil-test-document` (multipart upload / delete)
Auth required; only the creator. Same constraints as production-data documents (10MB max);
attaches to `override_verification_document_path` / `override_soil_test_document_path` on the
offer itself, taking precedence over the grower's commodity-level default document.

---

## Bids (demand listings / RFQs)

`backend/bids_routes.py`. International buyers, or (on their behalf, with approval) a Service
Provider/Trader. `VALID_BID_TYPE = (available_grain, acres_for_contracting,
volumes_for_contracting)`.

### `POST /api/bids`
Auth required; role must be `international_buyer` or `service_provider` (403 otherwise).
Required: `commodity`, `bid_type`, `quantity`. **On-behalf-of**: a `service_provider` MUST pass
`on_behalf_of_buyer_account_id` (400 otherwise) and must actively represent that buyer (400
`"you don't actively represent this buyer"` otherwise — see Buyer representation below); forced
to `buyer_approval_status=pending` and notifies the buyer. A buyer creating their own bid never
sets this. `area_unit` is accepted only for `acres_for_contracting` (display-only — the quantity
itself is expected to already be normalized to acres by the client before it reaches this
endpoint). Also accepts `required_attributes`/`required_practices`/`required_certifications`/
`required_data_requirements`/`required_attribute_notes` (a dict), `allow_partial` (bool, default
true), `destination_country`, delivery window dates.

### `GET /api/bids` (browse)
Auth required. Only `status=open` and not `buyer_approval_status=pending` (excludes an
on-behalf-of bid still awaiting buyer approval). Query filters: `commodities`, `bid_types`,
`attributes`, `destination_countries`, `quantity_min`/`quantity_max`. Each result includes
`has_active_negotiation`, `remaining_quantity` (supports partial fulfillment, same convention as
Offers), `created_by_name`.

### `GET /api/bids/mine`
Auth required. Every bid the caller created, each with `on_behalf_of_buyer_name` when applicable.

### `GET /api/bids/pending-approval`
Auth required; `international_buyer` role only. Bids a service provider wants to place on this
buyer's behalf, awaiting approval, each with `service_provider_name`.

### `POST /api/bids/<bid_id>/approve` / `POST /api/bids/<bid_id>/decline`
Auth required. Only the buyer the bid is on-behalf-of may act, only while pending. Approve →
`buyer_approval_status=approved` (bid stays `open`); decline → `buyer_approval_status=declined`,
`status=closed`. Notifies the service provider either way.

### `PATCH /api/bids/<bid_id>`
Auth required; only the creator. **Immutable**: `commodity`, `bid_type`, `quantity`, `area_unit`
(close and recreate instead). Editable: `variety`, `bid_price_usd_per_mt`, delivery window,
required-attribute/practice/cert/data-requirement lists + notes, `destination_country`,
`allow_partial`.

### `POST /api/bids/<bid_id>/close`
Auth required; only the creator. Sets `status=closed`.

### `POST /api/bids/<bid_id>/touch`
Auth required; only the creator. Bumps `updated_at` (same "still interested?" nudge as Offers).

---

## Responses & chat

`backend/responses_routes.py`. Generalizes "respond to a listing" across both Offers and Bids
into one `listing_responses` table. Status lifecycle: `pending → in-communication →
in-negotiation → accepted|declined`. Chat is only allowed once the listing's creator has moved
the response past `pending` (`CHATTABLE_STATUSES = in-communication, in-negotiation, accepted`).

### `POST /api/offers/<listing_id>/respond` / `POST /api/bids/<listing_id>/respond`
Auth required. 400 if responding to your own listing. Body: `proposed_price`, `proposed_volume`,
`marketing_year`, optional `match_score` (set when initiated from Signal Match Results).
**Partial fulfillment cap**: `proposed_volume` can't exceed what's still `remaining` on the
listing (400 otherwise) — several responses can each later be accepted, as long as their amounts
never together exceed the listing's original total; a bid with `allow_partial=false` additionally
requires the proposed amount to exactly equal the full remaining amount. **Grower inventory
check**: if this is a response to a *bid* with a `marketing_year`, from a `grower`/
`program_operator`, it's checked against that grower's remaining inventory for the bid's
commodity (grain or acres pool depending on `bid_type`) — same 400-with-message convention as
Offers' own inventory cap. Notifies the listing's creator.

### `GET /api/responses`
Auth required. Dual view: `made_by_me` (responses the caller submitted) and `to_my_listings`
(responses received on the caller's own offers/bids, each with `responder_name`), both enriched
with a `listing_summary` (commodity/variety/quantity/uom).

### `POST /api/responses/<response_id>/status`
Auth required; only a participant (the listing's creator or the responder) may view/act, and
**only the listing's creator** may actually change status (403 for the responder). Body:
`status` — one of `in-communication`, `in-negotiation`, `accepted`, `declined`. Accepting
re-validates the partial-fulfillment cap at accept time (not just at response-creation time,
since other responses may have been accepted in between) — 400 if it would now exceed what's
left. **Accepting auto-creates a `contracts` row** (idempotent — `contracts.response_id` is
unique) visible to both parties, and if the listing is now fully committed, closes it
(`offers.status=accepted` / `bids.status=closed`) so no further responses can come in. Notifies
the responder of the status change.

### `GET /api/responses/<response_id>/messages` / `POST /api/responses/<response_id>/messages`
Auth required; only a participant. POST body: `body` (required, 4000 char max); 400 if the
response hasn't reached a chattable status yet (`"the listing's creator must start communication
before messaging"`). Notifies the other participant.

---

## Contracts & disputes

`backend/contracts_routes.py`. A contract is created automatically when a response is accepted
(see above) — there is no direct "create contract" endpoint.

### `GET /api/contracts`
Auth required. Scope depends on role: superadmin sees all; `international_buyer` sees their own
(as buyer); `service_provider` sees every contract for their actively-represented buyers; every
other role (seller side) sees their own as seller. Each result includes `seller_name`,
`buyer_name`, `counterparty_name` (relative to the caller), `has_open_dispute`.

### `GET /api/my-stats`
Auth required. Windowed (current vs. prior period — see `stats.py`) summary of the caller's own
contract activity: `total_volume_mt`, `gmv_usd`, `total_transactions`, `active_counterparties`. A
`program_operator`'s figures roll up their actively-enrolled growers' contracts too (reporting
only — ownership stays with the grower); a `service_provider`'s reflect their represented buyers'.

### `POST /api/disputes`
Auth required; only a party to the contract (either direct party, or a service provider
representing the buyer side — 403 otherwise). Body: `contract_id`, `reason` (both required),
`category` (one of `non_performance, quality_condition, force_majeure, demurrage_laytime,
price_damages, other` — default `other`), optional `description`. `quality_condition` routes to
`resolution_track=expert_determination`; everything else to `arbitration`. Computes an advisory
`filing_deadline` (90 days from the contract's delivery-window end, or creation date if unknown)
and flags `is_time_barred` if already past it (informational only — not enforced as a hard
block). Notifies the other side. Response includes `dispute_id`, `is_time_barred`.

### `PATCH /api/contracts/<contract_id>/status`
Auth required; only a party (same rule as disputes) may act. Body: `status` — one of `pending`,
`shipped`, `completed`, enforced **forward-only** (400 if it would move backward).

---

## Buyer representation (Trader ↔ Buyer)

`backend/representations_routes.py`. A `service_provider` requests to represent an
`international_buyer`; the buyer approves/declines. No cap on either side (a buyer may work with
several traders; a trader may represent several buyers) — unlike Program enrollments below.

### `GET /api/international-buyers`
Auth required (any role). Just `id`/`name` — populates a trader's "request to represent" picker.

### `POST /api/buyer-representations/request`
Auth required; `service_provider` only. Body: `buyer_account_id` (must be a real
`international_buyer` account — 404 otherwise). 400 if a request (pending or active) already
exists with this buyer. Notifies the buyer.

### `GET /api/buyer-representations/mine`
Auth required; `service_provider` only. The trader's own requests (pending and active), each with
`buyer_name`.

### `GET /api/buyer-representations/active-buyers`
Auth required; `service_provider` only. Just the **active** (approved) buyers — powers the
on-behalf-of picker in `CreateRfqForm`.

### `DELETE /api/buyer-representations/<representation_id>`
Auth required; `service_provider` only, must own the request, and it must still be `pending`
(400 otherwise) — can't cancel an already-active representation this way.

### `GET /api/buyer-representations/pending`
Auth required; `international_buyer` only. Trader requests awaiting this buyer's approval, each
with `service_provider_name`.

### `PATCH /api/buyer-representations/<representation_id>/approve` / `.../decline`
Auth required; `international_buyer` only, must own the request, must be `pending`. Approve →
`status=active`; decline → row deleted entirely (unlike a service request's decline, which is
kept on file). Notifies the trader either way.

---

## Buyer requirements

`backend/requirements_routes.py`. A buyer's standing sourcing requirements (distinct from any one
posted bid) — currently read/written, not yet fed into matching.

### `GET /api/buyer-requirements` / `PUT /api/buyer-requirements`
Auth required; `international_buyer` only. GET returns `null` if never set. PUT is a full
upsert: `volumes_min`/`volumes_max`, `commodities`, `attributes`, `practices`,
`traceability_required` (bool), `certification_required`, `production_data_required` (bool).

---

## Program enrollments (Operator ↔ Grower)

`backend/enrollments_routes.py`. A program operator's roster of growers — either operator-entered
by name only (`grower_name_freeform`, no real account), or grower-initiated and tied to a real
account. **A grower may have at most one active-or-pending affiliation at a time** (unlike buyer
representation, which has no cap).

### `GET /api/program-operators`
Auth required (any role). Just `id`/`name` — populates a grower's affiliation picker.

### `POST /api/enrollments`
Auth required; `program_operator` only. Body: `grower_name_freeform` (required), `grower_email`,
`farms_count`, `acres_enrolled`, `primary_practices`, `status` (`active` default or `pending`).
Operator-entered — no real grower account attached.

### `GET /api/enrollments/growers-inventory`
Auth required; `program_operator` only. Read-only rollup of actively-enrolled growers' Grower
Inventory rows (ownership/write-access stays with the grower).

### `GET /api/enrollments/mine`
Auth required; `program_operator` only. The operator's full roster, each with
`grower_account_name` when tied to a real account, plus a `program_rollup.published_offers_count`
combining the operator's own + active growers' published offers.

### `GET /api/enrollments/active-growers`
Auth required; `program_operator` only. Active, account-linked growers only (freeform-only
enrollments excluded — nothing to approve on their behalf), each with `acres_remaining` — powers
`OfferForm`'s on-behalf-of picker.

### `PATCH /api/enrollments/<enrollment_id>`
Auth required; only the enrolling operator. Body: any of `grower_email`, `farms_count`,
`acres_enrolled`, `primary_practices`, `status`. **Approving** (`status → active`) on a
grower-linked row also sets that grower's `grower_profiles.program_affiliation`.

### `DELETE /api/enrollments/<enrollment_id>`
Auth required; only the enrolling operator.

### `POST /api/program-affiliation/request`
Auth required; `grower` only. Body: `program_operator_account_id` (required, must be a real
`program_operator` — 404 otherwise). 400 if already active-or-pending elsewhere. Pre-fills
`acres_enrolled`/`primary_practices` from the grower's own profile.

### `GET /api/program-affiliation`
Auth required; `grower` only. The grower's own current/most-recent affiliation (or `null`), with
`program_operator_name`.

### `DELETE /api/program-affiliation/<enrollment_id>`
Auth required; `grower` only, must own the request, must still be `pending` (can't leave an
already-active program this way).

---

## Matching (Signal Match Results)

`backend/matching_routes.py`. Read-only, on-demand scored ranking of counterparty listings for
one of the caller's own listings — no persisted "match" record, unlike the legacy Deals board.

### `GET /api/matching/preview`
Auth required; only the listing's own creator may preview it (403 otherwise). Query:
`listing_type` (`offer` or `bid`), `listing_id` (both required). Scores every open candidate on
the opposite side against the same commodity (0-100: commodity/variety 25pts, delivery-window
overlap 25pts, quality/attribute coverage 30pts, counterparty reliability 20pts — see module
docstring for the full rubric), sorted descending, each with a `rationale` breakdown per
dimension. An offer candidate includes an MT-equivalent price-comparison field; a bid candidate
includes `implied_total_value_usd`.

---

## Service Provider marketplace

`backend/service_requests_routes.py`. A directory of service providers plus a request →
accept/decline flow. Any of `grower`, `international_buyer`, `program_operator` may request a
service; only `service_provider` manages requests made to them. No scoring engine (generic
services have no delivery-window/attribute data to match on).

### `GET /api/service-providers`
Auth required; requester role only (`grower`/`international_buyer`/`program_operator`). Query:
`service_categories`, `states` (both optional, OR'd within each filter). Shows every
`service_provider` account, including ones with an empty profile. Each result includes
`reputation`.

### `POST /api/service-requests`
Auth required; requester role only. Body: `service_provider_account_id` (required, must be a
real service_provider — 404 otherwise), `service_category`, `message`. **Only blocks a second
PENDING request** to the same provider (400) — re-requesting after an accept or decline is
allowed (declines are kept on file, not deleted, unlike buyer representation). Notifies the
provider.

### `GET /api/service-requests/mine`
Auth required; requester role only. The requester's own requests (pending/accepted/declined),
each with `service_provider_name`.

### `GET /api/service-requests/pending`
Auth required; `service_provider` only. This provider's inbox, each with `requester_name`.

### `PATCH /api/service-requests/<request_id>/accept` / `.../decline`
Auth required; `service_provider` only, must own the request, must be `pending`. Declining keeps
the row on file (`status=declined`) rather than deleting it. Notifies the requester either way.

### `DELETE /api/service-requests/<request_id>`
Auth required; requester only, must own the request, must still be `pending`. Deletes the row
entirely (nothing happened on the provider's side yet, so nothing worth keeping).

---

## Notifications

`backend/notifications_routes.py`. In-app only (no push/email) — a bell icon polls this.

### `GET /api/notifications`
Auth required. Most recent 50, newest first, plus `unread_count`.

### `PATCH /api/notifications/<notification_id>/read`
Auth required. Marks one notification read (scoped to the caller's own — the query includes
`account_id`, so acting on someone else's id is a silent no-op, not an error).

### `PATCH /api/notifications/read-all`
Auth required. Marks every unread notification read for the caller.

---

## Company join requests

`backend/company_routes.py`. The approval side of `POST /api/onboarding/join` — a company's
first-registered admin (or any superadmin) approves/declines later logins asking to join.

### `GET /api/company/join-requests`
Auth required; company admin (or superadmin) only (403 otherwise — checked fresh from the DB
every call). This company's own pending requests, each with `requester_name`/`requester_email`
(from the verified Auth0-linked email, not the self-reported display name).

### `PATCH /api/company/join-requests/<request_id>/approve` / `.../decline`
Auth required; company admin (or superadmin) only, must be this company's own pending request.
Approve links the requester's login to the account (`auth0_users.account_id`) under the role they
asked for and notifies the company; decline just marks the request declined (the requester has no
account yet to notify directly — they see it via `/api/me`'s `pending_join_request`).

---

## Attribute requests

`backend/attribute_requests_routes.py`. "Don't see an attribute you need?" — any user can propose
a new taxonomy term from wherever they're picking one; a superadmin reviews it.

### `POST /api/attribute-requests`
Auth required (any role). Body: `type`, `name` (both required), `description`. Notifies every
`role=admin` account plus the `SUPERADMIN_ACCOUNT_ID` bootstrap account.

### `GET /api/admin/attribute-requests`
Superadmin only. All `pending` requests, each with `requested_by_name`.

### `PATCH /api/admin/attribute-requests/<request_id>/dismiss`
Superadmin only. Marks `status=dismissed`.

### `PATCH /api/admin/attribute-requests/<request_id>/mark-added`
Superadmin only. Marks `status=added` — called *after* the admin has separately created the real
term via `POST /api/admin/taxonomy` (this endpoint doesn't create the term itself).

---

## Counties

`backend/counties_routes.py`. Seeded from the Census Bureau county gazetteer (all 50 states,
3,143 counties).

### `GET /api/counties`
Auth required (any role). Query: `state` (required — county names collide across states, so
there's deliberately no unscoped search), optional `q` (name substring). Returns up to 300
matches, alphabetical.

---

## Admin

`backend/admin_routes.py`. Every route here requires `is_superadmin()` — either
`accounts.role == 'admin'`, or an account id match against the `SUPERADMIN_ACCOUNT_ID` bootstrap
config value (so the very first admin doesn't need a DB edit).

### `GET /api/admin/dashboard`
Windowed marketplace-wide stats (`total_volume_mt`, `gmv_usd`, `total_transactions`,
`active_buyers`, `active_sellers`), `volume_by_state` (a multi-state offer's volume counts toward
every state it lists — a deliberate over-count, not a bug), and the 10 most recent transactions.

### `GET /api/admin/accounts`
Every account with role, freeze state, contact info, `role_switching_enabled`, and its linked
Auth0 email.

### `PATCH /api/admin/accounts/<account_id>/freeze`
Body: `frozen` (bool), `reason`. 400 if trying to freeze your own account. Enforced at the
account's *next login*, not the current session (see `auth.py`'s `callback`).

### `PATCH /api/admin/accounts/<account_id>/role-switching`
Body: `enabled` (bool) — the gate `POST /api/roles` and `POST /api/switch-role` both check,
re-read fresh from the DB on every call (no re-login needed for this to take effect).

### `GET /api/admin/join-requests`
Every company's pending join requests platform-wide (a superadmin backstop for when a company has
no admin available yet) — see Company join requests above for the per-company view.

### `PATCH /api/admin/join-requests/<request_id>/approve` / `.../decline`
Same effect as the company-admin equivalents in `company_routes.py`, callable by any superadmin
regardless of which company the request belongs to.

### `GET /api/admin/listings`
Every offer and bid platform-wide (any status), unified into one list with `created_by_name`.

### `DELETE /api/admin/listings/<listing_type>/<listing_id>`
`listing_type` must be `offer` or `bid`. Hard admin takedown — no notification, no soft-delete.

### `GET /api/admin/disputes`
Every dispute platform-wide, each with a computed `contract_summary` string and all resolution/
appeal metadata.

### `PATCH /api/admin/disputes/<dispute_id>/resolve`
Body: `resolution_notes`. Only affects a dispute currently `status=open` (404 otherwise —
"not found or already resolved"). Notifies both contract parties.

### `PATCH /api/admin/disputes/<dispute_id>/appeal`
Only a `tier=tribunal`, `status=resolved` dispute can be appealed (400 otherwise), and only within
30 days of its resolution (400 `"the 30-day appeal window has passed"` otherwise). Reopens it at
`tier=board_of_appeal`, preserving the original tribunal resolution notes separately.

---

## Legacy: carbon/ag-outcomes "Deals" board

`backend/match_routes.py` — **this predates the METI Match marketplace pivot** (it's the original
`open_match` carbon-credit/ag-outcomes matching engine: buyer/seller "deals" scored on
state/commodity/year/taxonomy overlap and numeric outcome quantities, e.g. reductions/removals/
water quality). It is still mounted and functional, but is a separate, older data model
(`config.MATCH_TABLE`, default `open_match`) from the offers/bids/responses/contracts system
everything else in this doc describes. Treat it as legacy unless you've confirmed it's still an
active product surface.

- `POST /api/deals` — create a deal (auto-approved, live immediately); returns candidate matches.
- `POST /api/deals/preview` — score-only, no row created.
- `GET /api/deals` — browse approved deals (filters: `type`, `states`, `commodities`, `years`).
- `POST /api/deals/<deal_id>/interest` — express interest (lands as `pending` in
  `match_statuses`); 400 on your own deal or a repeat.
- `GET /api/matches` — the caller's own deals-with-interest, from both sides.
- `POST /api/matches/<deal_id>/status` — deal creator only; body `status` (one of
  `in-communication`, `in-negotiation`, `deal-made`, `declined`) + `match_account_id`.
- `GET`/`POST /api/matches/<deal_id>/messages` — per-interested-party chat thread, closed once
  that party is `declined`.
- `GET /api/admin/deals/pending` / `POST /api/admin/deals/<deal_id>/approve` — superadmin-only
  manual approval queue (deals are auto-approved today, so this is effectively unused unless that
  changes).
- `GET /api/admin/deals/all` / `DELETE /api/admin/deals/<deal_id>` — superadmin oversight/takedown.

---

## Misc

- `GET /health` — no auth. `{"status": "healthy"}`. Liveness probe only.
- `GET /`, `GET /<path:path>` — not part of the JSON API. Serves the built React SPA
  (`frontend/dist`) for any non-`/api/*` path, falling back to `index.html` for client-side
  routing; returns a plain 404 JSON for an unmatched `/api/*` path.

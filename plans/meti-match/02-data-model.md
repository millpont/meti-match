# Data model

Schema sketch for the new Supabase project. Written as a plan, not final DDL — Phase 0
(01-roadmap.md) turns this into real `migrations/*.sql`. Follows this repo's existing
conventions: `uuid` PKs via `gen_random_uuid()`, `text[]`/`jsonb` for multi-select fields,
`created_at`/`updated_at` timestamps, a `check` constraint for enums instead of a separate lookup
table (as `open_match.account_type` does today).

## Identity

### `accounts`
Recreated fresh in the new project (was borrowed from METI before).

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `role` | text | check in `('grower','program_operator','international_buyer','service_provider','admin')` |
| `name` | text | display name (farm/company/org name) |
| `created_at` | timestamptz | |

### `auth0_users`
Same shape as today's borrowed table.

| column | type | notes |
|---|---|---|
| `auth0_id` | text pk | Auth0 `sub` |
| `account_id` | uuid | fk `accounts.id`, **nullable until onboarding wizard completes** |
| `email`, `first_name`, `last_name` | text | from Auth0 userinfo |

Login flow: `_ensure_auth0_user` still inserts a row on first login, but with `account_id NULL`
— the frontend, seeing `account_id: null` from `/api/me`, routes the user to the role
picker/wizard (mockup page 2) instead of an "awaiting admin" state.

## Role profiles

One table per role, `account_id` is both PK and FK (`accounts.id`) — a 1:1 profile row per
account. Fields lifted directly from the registration wizards (pages 3–5).

### `grower_profiles`
`account_id`, `farm_name`, `state`, `county`, `total_acres`, `primary_crops text[]` (corn,
soybeans, sorghum, wheat), `conservation_practices text[]` (no-till, cover crops, nutrient
management), `program_affiliation` (nullable fk → `program_operator_profiles.account_id`,
populated if/when a program operator enrolls them — see below).

### `program_operator_profiles`
`account_id`, `organization_name`, `organization_type`, `states_covered text[]`,
`aggregates_from_growers boolean`, `offers_own_grain boolean`, `own_farm_acres`,
`verified_practices text[]` (conservation tillage, cover crops, nutrient management plan,
buffer strips, reduced/no synthetic inputs, other).

### `program_enrollments`
Because a program operator aggregates *multiple* growers (page 10's "Enrolled Growers" table),
this is its own table, not folded into `grower_profiles`:

`id`, `program_operator_account_id`, `grower_account_id` (nullable — a program operator can
enroll a grower who isn't a platform account yet, tracked by name only until they sign up),
`grower_name_freeform` (used when `grower_account_id` is null), `farms_count`, `acres_enrolled`,
`primary_practices text[]`, `enrollment_date`, `status` check in `('active','pending')`.

### `international_buyer_profiles`
`account_id`, `company_name`, `country`, `sector` (Food/Feed/Pet Food/Aquaculture),
`annual_purchase_volume_mt`, `commodities_of_interest text[]`, `required_attributes text[]`
(non-GMO, low-CI, sustainable, traceability certification), `destination_ports text[]`.

### `service_provider_profiles`
**OPEN QUESTION** (see 00-overview.md) — no mockup screen defines these fields. Placeholder
shape until scoped: `account_id`, `company_name`, `services_offered text[]`, `states_covered
text[]`.

## Listings

### `offers` (supply side — growers and program operators)
Mirrors page 8's "Create New Offer" form + table.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `created_by` | uuid | fk `accounts.id` (grower or program_operator) |
| `commodity` | text | corn / soybeans / sorghum / wheat |
| `crop_year` | text | |
| `expected_volume` | numeric | |
| `uom` | text | bushels / MT |
| `acres_offered` | numeric | nullable |
| `price_type` | text | fixed / basis |
| `desired_price` | numeric | nullable |
| `harvest_start`, `harvest_end` | date | |
| `sustainability_attributes` | text[] | low carbon intensity, regenerative ag, water/nutrient efficient, soil health, biodiversity |
| `conservation_practices` | text[] | no-till, cover crops, nutrient management, buffer strips, reduced till, crop rotation, conservation tillage, wetland protection |
| `specialty_attributes` | text[] | non-GM, organic, food grade, other content flags |
| `location_state`, `location_county` | text | for the public listing card (page 6/15/16 show city/state) |
| `certifications` | text[] | Non-GMO, FSA GAP, Organic, GMP+, SQF, FSMA — controlled vocabulary, see below |
| `status` | text | check `('draft','published','accepted','withdrawn')` |
| `created_at`, `updated_at` | timestamptz | |

### `bids` (demand side — buyers' postings/requirements)
Mirrors pages 9/13's bid cards ("Available Grain" / "Acres for Contracting" / "Volumes for
Contracting").

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `created_by` | uuid | fk `accounts.id` (international_buyer) |
| `commodity` | text | |
| `bid_type` | text | check `('available_grain','acres_for_contracting','volumes_for_contracting')` |
| `volume_mt` or `acres` | numeric | one or the other depending on `bid_type` |
| `bid_price_usd_per_mt` | numeric | |
| `delivery_window_start`, `delivery_window_end` | date | |
| `required_attributes` | text[] | non-GMO, low-CI, sustainable, traceability certification |
| `destination_country` | text | |
| `status` | text | check `('open','closed')` |
| `created_at`, `updated_at` | timestamptz | |

### `buyer_requirements`
Distinct from `bids` — this is the buyer's standing profile of what they're generally looking
for (page 13's "My Requirements: Basic / Advanced" panel), used to compute "Matching U.S. Supply
Offers" rather than a specific posted bid. `account_id` (buyer), `volumes_min`, `volumes_max`,
`commodities text[]`, `attributes text[]`, `practices text[]`, `traceability_required boolean`,
`certification_required text[]`, `production_data_required boolean`.

## Responses / negotiation (generalizes today's `matches`/`match_statuses`)

### `listing_responses`
One row per "Contact Supplier" / "Respond to Bid" / "Place a Bid" action — the equivalent of
today's `open_match.matches` + `match_statuses`, but pulled into its own table since it now needs
its own columns (proposed price/qty) rather than fitting in a jsonb blob, and needs to reference
either an offer or a bid.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `listing_type` | text | check `('offer','bid')` |
| `listing_id` | uuid | fk into `offers.id` or `bids.id` depending on `listing_type` |
| `responder_account_id` | uuid | fk `accounts.id` — the counterparty (buyer responding to an offer, or grower/operator responding to a bid) |
| `proposed_price`, `proposed_volume` | numeric | nullable — a counter-offer |
| `status` | text | check `('pending','in-communication','in-negotiation','accepted','declined')` — same lifecycle shape as today's `VALID_STATUSES`, `pending` added as the initial state (today's code sets this implicitly; making it explicit here) |
| `match_score` | numeric | nullable — populated by the matching engine (03-api-plan.md) when the response originates from a suggested match rather than a manual browse-and-contact |
| `created_at`, `updated_at` | timestamptz | |

### `listing_response_messages`
Same shape as today's `open_match_messages`: `id`, `response_id` (fk), `sender_account_id`,
`body`, `created_at`. Chat is scoped to a `listing_responses` row instead of `(deal_id, party)`.

## Contracts

### `contracts`
Created when a `listing_responses` row reaches `status = 'accepted'` (pages 9, 14, 17 all show a
contracts/transactions view downstream of a match).

`id`, `response_id` (fk, unique — one contract per accepted response), `seller_account_id`,
`buyer_account_id`, `commodity`, `final_volume`, `final_price_usd_per_mt`, `delivery_window_start`,
`delivery_window_end`, `status` check `('pending','shipped','completed')`, `created_at`.

## Production data

### `production_data`
Page 7's "Production Data Progress" (Basic 100%, Advanced 60%). `account_id` (grower),
`section` check `('basic','advanced')`, `data jsonb` (freeform per-section fields — yield
history, input usage, etc., not detailed in the mockup), `completion_pct`, `updated_at`.
**OPEN QUESTION:** the mockup doesn't show the actual fields inside "Advanced Production Data" —
scope this before Phase 6 (roadmap).

## Controlled vocabularies

Follow the existing pattern (`frontend/src/taxonomy.ts` + `frontend/src/constants.ts`) rather
than DB lookup tables — these are small, stable lists:

- **Commodities:** corn, soybeans, sorghum, wheat.
- **Sustainability attributes:** low carbon intensity, regenerative agriculture, water
  efficient, nutrient efficient, soil health, biodiversity, non-GMO, sustainable, traceability
  certification.
- **Conservation practices:** no-till, cover crops, nutrient management, buffer strips, reduced
  till, crop rotation, conservation tillage, wetland protection.
- **Certifications:** Non-GMO, FSA GAP, Organic, GMP+, SQF, FSMA, Food Grade.

## Indexes (mirroring today's `idx_open_match_*` rationale)

- `offers(status, commodity, created_at desc)`, `bids(status, commodity, created_at desc)` —
  board queries.
- `offers(created_by)`, `bids(created_by)` — "my listings."
- `listing_responses(listing_type, listing_id)`, `listing_responses(responder_account_id)`.
- `program_enrollments(program_operator_account_id)`.

# User Roles

An account is created through self-service onboarding (`POST /api/onboarding/<role>` — see
`backend/onboarding_routes.py`), not an admin-linking flow. Each account's role set is tracked in
the `account_roles` table (an account can hold more than one role — see "Multi-role accounts"
below), and is cached on the session at login as `session["role"]` (the *active* role — which
dashboard renders) and `session["roles"]` (the full set held). Every role gate below is enforced
**server-side**, in the route itself (typically via a `_require_<role>()` helper that checks
`session.get("role")`), not just hidden/shown in the frontend — a direct API call from the wrong
role gets a 403 regardless of what the UI would have shown.

There are four onboardable roles — **Grower**, **Program Operator**, **International Buyer**,
**Service Provider** — plus **Superadmin**, which is a role value (`"admin"`) rather than a
separate account type.

---

## Grower

**Onboarding**: `POST /api/onboarding/grower` — requires `name`, `company` (farm name),
`ein_last4` (4 digits), `phone`, `email`. Creates a `grower_profiles` row
(`farm_name`, empty `primary_crops`/`conservation_practices` to start).

**Profile**: shares the account-level profile fields every role has (photo, bio, website, links,
contact-visibility toggle, photo gallery — see `backend/profile_routes.py`). No grower-specific
profile fields beyond `grower_profiles`' own columns, which aren't exposed through the profile
endpoints — production data lives separately (see below).

**Dashboard**: `frontend/src/grower/GrowerDashboard.tsx`.

**Can do**:
- Manage grain/acres inventory per commodity + marketing year — `GET/PUT/DELETE
  /api/grower-inventory/...`, `GET /api/grower-inventory/remaining` (`backend/inventory_routes.py`).
  Deleting an inventory row is blocked while any non-withdrawn offer is still committed against it.
- Create and manage grain-offer listings — `POST/GET/PATCH /api/offers`, `/api/offers/mine`,
  `/api/offers/<id>/withdraw`, verification-document and soil-test-document upload/delete
  (`backend/offers_routes.py`). Gated to `role in ("grower", "program_operator")`.
- Respond to buyer bids and manage the responses on their own offers — `POST
  /api/bids/<id>/respond`, `GET /api/responses`, `POST /api/responses/<id>/status` (accept/reject),
  per-negotiation chat (`GET/POST /api/responses/<id>/messages`) — `backend/responses_routes.py`.
- View/manage resulting contracts — `GET /api/contracts`, `GET /api/my-stats`, file a dispute
  (`POST /api/disputes`), advance contract status (`PATCH /api/contracts/<id>/status`) —
  `backend/contracts_routes.py`.
- Optionally affiliate with one Program Operator at a time —
  `POST /api/program-affiliation/request`, `GET /api/program-affiliation`, `DELETE
  /api/program-affiliation/<id>` (`backend/enrollments_routes.py`; only a *pending* or *active*
  request can be cancelled, and a grower may have at most one outstanding at a time).
- Request a Service Provider's services — `POST /api/service-requests`, `GET
  /api/service-requests/mine`, `DELETE /api/service-requests/<id>` while still pending
  (`backend/service_requests_routes.py`; `role in REQUESTER_ROLES`, shared with buyers and
  operators).
- Submit ad hoc attribute requests to the taxonomy admin — `POST /api/attribute-requests`
  (`backend/attribute_requests_routes.py`; open to any authenticated role, not grower-specific —
  notifies every superadmin on creation).
- `GET /api/offers/pending-approval` + `/approve`/`/decline` — a grower reviews offers a Program
  Operator created **on their behalf** (`on_behalf_of_grower_account_id`) before they go live;
  gated to `role == "grower"` only (not operators).

**Notable rules**: offer creation is capped by the grower's own inventory (`remaining_volume`/
`remaining_acres` computed live from committed, non-withdrawn offers — see `inventory_routes.py`);
there's no hard cap when no inventory row exists yet for that commodity (nothing to block against).

---

## Program Operator

**Onboarding**: `POST /api/onboarding/operator` — same shared contact fields as every role.
Creates a `program_operator_profiles` row (`organization_name`, empty `states_covered`/
`verified_practices`, `aggregates_from_growers`/`offers_own_grain` both defaulted `true` — neither
flag currently gates anything in the app).

**Dashboard**: `frontend/src/operator/OperatorDashboard.tsx`.

**Can do**:
- Manage an enrolled-grower roster — `POST /api/enrollments` (operator-entered by name, for a
  grower not yet on the platform, `grower_account_id` stays null), `GET /api/enrollments/mine`,
  `GET /api/enrollments/growers-inventory`, `GET /api/enrollments/active-growers`, `PATCH`/`DELETE
  /api/enrollments/<id>` (`backend/enrollments_routes.py`). Gated to `role == "program_operator"`.
- Approve or decline a grower's self-initiated program-affiliation request (same enrollment row,
  approving sets the grower's `grower_profiles.program_affiliation`; declining just deletes the
  pending row).
- Create grain-offer listings identically to a Grower — same `offers_routes.py` gate
  (`role in ("grower", "program_operator")`) — including **on behalf of** an enrolled grower
  (`on_behalf_of_grower_account_id`), which routes the created offer to that grower's
  pending-approval queue rather than publishing it directly (`session.get("role") !=
  "program_operator"` is the check that triggers this path).
- Respond to bids, manage contracts, request services — identical endpoints/gates to Grower
  (responses, contracts, service-requests all include `program_operator` in their allowed-role
  sets where noted above).

**Notable rules**: a Program Operator is functionally a superset of Grower marketplace
capabilities plus the enrollment roster — the two roles share most of `offers_routes.py`,
`responses_routes.py`, and `contracts_routes.py`.

---

## International Buyer

**Onboarding**: `POST /api/onboarding/buyer` — same shared contact fields. Creates an
`international_buyer_profiles` row (`company_name`, empty `commodities_of_interest`/
`required_attributes`/`destination_ports`).

**Dashboard**: `frontend/src/buyer/BuyerDashboard.tsx`.

**Can do**:
- Create and manage bids/RFQs — `POST/GET /api/bids`, `/api/bids/mine`, `PATCH /api/bids/<id>`,
  `/api/bids/<id>/close`, `/api/bids/<id>/touch` (`backend/bids_routes.py`). `area_unit` (acres/
  hectares, for `acres_for_contracting` bids) is immutable after creation.
- Respond to grower/operator grain offers — `POST /api/offers/<id>/respond`, manage the resulting
  `responses`/chat/contracts the same way a grower does on the other side of the trade.
- Manage buyer-representation relationships with Service Providers (Traders) —
  `GET /api/buyer-representations/pending`, `/approve`, `/decline`
  (`backend/representations_routes.py`, gated to `role == "international_buyer"`). A represented
  Trader can then place bids and manage contracts **on this buyer's behalf**.
- `GET /api/bids/pending-approval` + `/approve`/`/decline` — review bids a representing Trader
  placed on their behalf before they go live (`session.get("role") == "international_buyer"` only).
- Request a Service Provider's services (same `service_requests_routes.py` flow as Grower/Operator).
- Maintain sourcing requirements — `GET/PUT /api/buyer-requirements` (`backend/requirements_routes.py`;
  gated to `role == "international_buyer"` only — a single row per buyer describing desired
  commodities/attributes/volumes, used to surface matching offers to them elsewhere in the app).

**Notable rules**: a buyer may work with several Traders at once — no "at most one" cap, unlike a
grower's single Program Operator affiliation.

---

## Service Provider

**Onboarding**: `POST /api/onboarding/service_provider` — same shared contact fields. Creates a
`service_provider_profiles` row (`company_name` only; `services_offered`/`states_covered` start
empty and are edited later via the profile endpoint).

**Dashboard**: `frontend/src/service_provider/ServiceProviderDashboard.tsx`.

**Can do**:
- Edit `services_offered`/`states_covered` via `PUT /api/profile` — these two fields are only
  accepted/returned on the profile endpoints when `session["role"] == "service_provider"`
  (`backend/profile_routes.py`'s `SP_EDITABLE_FIELDS`).
- Appear in, and be found through, the provider directory — `GET /api/service-providers`
  (called by growers/buyers/operators, filterable by `service_categories`/`states`).
- Manage inbound service requests — `GET /api/service-requests/pending`, `PATCH
  /api/service-requests/<id>/accept`, `/decline` (`backend/service_requests_routes.py`). Unlike
  `buyer_representations`, a declined request stays on file (not deleted) and doesn't block the
  same requester from asking again later — only a second *pending* request to the same provider
  is blocked.
- Operate as a **Trader** for International Buyers — request to represent a buyer (`POST
  /api/buyer-representations/request`), view `mine`/`active-buyers`, cancel a still-pending
  request (`backend/representations_routes.py`, gated to `role == "service_provider"`). Once a
  buyer approves, this Service Provider can place bids with `on_behalf_of_buyer_account_id` set to
  that buyer, and gains visibility/status-management rights on that buyer's resulting contracts
  (see `contracts_routes.py` and `bids_routes.py`).

**Notable rules**: "Service Provider" and "Trader" are the same account role — the Trader
capability (representing buyers) is just one more thing a Service Provider account can do, not a
separate role or onboarding path. A buyer may be represented by several Traders simultaneously.

---

## Superadmin

Not a distinct onboarding path — `session.get("role") == "admin"` (set by a DB edit promoting an
existing account, or matching the bootstrap `config.SUPERADMIN_ACCOUNT_ID`; see `auth.py`'s
`is_superadmin()`). There's no self-service admin signup.

**Can do**:
- Manage the shared vocabulary (attributes, practices, certifications, data requirements, service
  categories) — `POST/PATCH/DELETE /api/admin/taxonomy...` (`backend/taxonomy_routes.py`; `GET` is
  open to every authenticated role, mutation is superadmin-only).
- Platform-wide account administration — `GET /api/admin/dashboard`, `/api/admin/accounts`,
  freeze/unfreeze an account (`PATCH /api/admin/accounts/<id>/freeze`), toggle whether an account
  may add/switch roles (`PATCH /api/admin/accounts/<id>/role-switching`) — `backend/admin_routes.py`.
- Act on **any** company's join requests (`/api/admin/join-requests...`) — not scoped to their own
  company, unlike a regular company admin's `company_routes.py` endpoints.
- Moderate listings and disputes — `GET/DELETE /api/admin/listings/...`, `GET
  /api/admin/disputes`, resolve/appeal a dispute (`PATCH /api/admin/disputes/<id>/resolve`,
  `/appeal`).
- Review ad hoc attribute requests submitted by any role — `GET
  /api/admin/attribute-requests`, dismiss or mark as added (`PATCH
  /api/admin/attribute-requests/<id>/dismiss`, `/mark-added`) — `backend/attribute_requests_routes.py`.
- `is_superadmin()` also grants elevated access inside otherwise role-gated endpoints elsewhere
  (e.g. `contracts_routes.py`'s `GET /api/contracts` returns every contract platform-wide for a
  superadmin, versus only the caller's own contracts for a normal role; `company_routes.py`'s
  join-request approve/decline accepts a superadmin acting on a company that isn't their own).

---

## Multi-role accounts

A single account (company) can hold more than one role at once — e.g. a Service Provider that
also runs its own Program Operator grain program (`migrations/0022_multi_role_accounts.sql`). The
full set of roles an account holds lives in `account_roles`; `session["roles"]` mirrors it at
login. Two related, **superadmin-gated** capabilities in `onboarding_routes.py`:

- `POST /api/roles` — add an additional role to an already-onboarded account (creates that role's
  minimal profile row, same defaults as onboarding, and switches the session to it immediately).
- `POST /api/switch-role` — change which role is *active* for the current session (which dashboard
  renders) among roles the account already holds. Not persisted — login always starts back on the
  account's primary (first-onboarded) role.

Both require `role_switching_enabled_for_id(account_id)` to be true — a per-account toggle only a
superadmin can flip (`PATCH /api/admin/accounts/<id>/role-switching`); by default an account is
locked to the single role it onboarded with.

## Freezing

`requires_auth` (in `auth.py`) blocks every API call — not just the frontend's suspension screen —
for any account with `session.get("frozen")` set, regardless of role, returning `403 {"error":
"account suspended", "frozen": True}`. Freeze state is cached on the session at login, so an admin
freezing an account mid-session takes effect on that account's *next* login, not instantly.

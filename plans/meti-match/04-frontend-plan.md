# Frontend plan

## Why this needs real routing now

Today's `App.tsx` is a single shell with internal tab state (Boards / Matches / Admin) because
there was only one account shape (buyer/seller, symmetric UI). The mockups show **role
determines the entire shell** — different sidebar, different home dashboard, different
vocabulary (compare page 7's grower sidebar: Home/My Profile/My Grain/Bids/Production Data,
against page 13's buyer sidebar: Home/My Company/Requirements/Offers/My Bids/Contracts). This is
the "more frontend distinction between roles" the user called out. Introduce `react-router-dom`
and a per-role shell component rather than trying to keep one shell that branches everywhere.

## Route map

| Route | Access | Mockup page(s) | Notes |
|---|---|---|---|
| `/` | public | 2 | Landing + role picker ("Join METI Match") |
| `/join/grower` | public, redirects if already onboarded | 3 | 4-step wizard: Account → Farm Profile → Practices → Review |
| `/join/operator` | public | 4 | Account → Program Profile → Growers and Aggregation → Own Production |
| `/join/buyer` | public | 5 | Account → Company Profile → Requirements → Review |
| `/join/service-provider` | public | — | placeholder until scoped (00-overview.md open question) |
| `/marketplace` | any authenticated role | 6 | Global hub, Offers/Bids side-by-side boards + filters |
| `/grower/*` | role=grower | 7, 8, 9 | see below |
| `/operator/*` | role=program_operator | 10, 11, 12 | see below |
| `/buyer/*` | role=international_buyer | 13, 14, 15, 16 | see below |
| `/admin/*` | role=admin | 17 | see below |

A logged-in user hitting a route outside their own role prefix redirects to their own `/​<role>`
root — mirrors the mockups never showing cross-role nav.

### `/grower/*` (page 7 sidebar: Home, My Profile, My Grain, Bids, Production Data)
- `/grower` — dashboard (4 action tiles + "My Grain Overview" stats + "Production Data
  Progress" bars, page 7).
- `/grower/profile` — profile/story editor.
- `/grower/offers` — "Create New Offer" form + "Your Offers" table (page 8).
- `/grower/bids` — browse open buyer bids with filters, respond (page 9).
- `/grower/production-data` — basic/advanced sections.

### `/operator/*` (page 10 sidebar: My Program, Enrolled Growers, Offers, Bids, Production Data)
- `/operator` — dashboard (action tiles + "Enrolled Growers" table with Export/Enroll Grower,
  page 10).
- `/operator/growers` — full enrolled-growers management (add/edit `program_enrollments` rows).
- `/operator/offers` — same "Create New Offer" component as grower's, reused (it's the same form
  in pages 8 and 11) — parameterize by `created_by` role rather than duplicating.
- `/operator/bids` — same "browse bids" component as grower's (pages 9 and 12 are the same
  screen) — reuse.

### `/buyer/*` (page 13 sidebar: Home, My Company, Requirements, Offers, My Bids, Contracts)
- `/buyer` — dashboard (action tiles + "My Requirements" summary + "Matching U.S. Supply
  Offers" table, page 13).
- `/buyer/company` — company profile editor.
- `/buyer/requirements` — basic/advanced requirements editor.
- `/buyer/supply` — searchable supply listing with heavy filters (commodity, location, quantity,
  delivery window, certifications, protein %) — pages 15/16, includes "Create RFQ" action
  (page 16) which posts a `bids` row.
- `/buyer/bids` — "My Bids" table + detail panel with match score/rationale and seller response
  thread (page 14) — this is where `listing_responses` + the matching-engine rationale render.
- `/buyer/contracts`.

### `/admin/*` (page 17 sidebar: Dashboard, Transactions, Listings, Users, Organizations,
Inventory, Contracts, Payments, Analytics, Disputes, Notifications, Settings)
- `/admin` — the analytics dashboard (stat tiles, volume/GMV charts, volume-by-state map, recent
  transactions table) — page 17. Charts: reuse whatever charting approach fits the repo's
  existing minimal-dependency style (no chart library exists yet — evaluate a lightweight one
  when this phase starts, e.g. a small SVG bar/line/choropleth rather than pulling in a heavy
  dependency for four chart types).
- `/admin/transactions`, `/admin/listings`, `/admin/users`, `/admin/organizations`,
  `/admin/contracts`, `/admin/disputes` — management tables, most reusing a shared `<DataTable>`
  component (sortable/paginated) rather than one bespoke table per resource.

### `/marketplace` (page 6)
Two-column Offers/Bids board with independent filter panels — closest existing analog is
today's `Boards.tsx`, generalized to grain listings and split into two simultaneous panels
instead of a single toggled board.

## New shared components (beyond what exists today)

- `RoleShell` — per-role sidebar + header, wraps all `/grower`, `/operator`, `/buyer`, `/admin`
  routes. Each role's shell instance just supplies its nav item list + label.
- `OnboardingWizard` — generic multi-step form runner (step indicator, next/back, review step)
  parameterized per role's field set; each role's step content is still its own component.
- `OfferForm` — shared between grower and operator (pages 8/11 are identical).
- `BidBrowseTable` — shared between grower and operator "browse open bids" (pages 9/12).
- `ListingCard` — the compact card used across the marketplace hub, supply search, and bid
  boards (commodity, location, volume, certifications badges, delivery window, CTA button) —
  one component, CTA label/action passed as a prop (`Contact Supplier` / `Respond to Bid` /
  `Place a Bid`).
- `MatchScoreRing` — the circular % + checklist component from page 14/18.
- `DataTable` — generic sortable/paginated table for all the admin management screens and "Your
  Offers"/"Enrolled Growers" tables.

## What carries over from today's frontend largely unchanged

- `ui.tsx` primitives, `Confetti.tsx` (page 18's mockups don't show a celebration moment but the
  existing "celebrate a match" UX is worth keeping on `accepted` responses — same trigger point).
- `ChatThread.tsx` — re-point at `/api/responses/<id>/messages`.
- `api.ts`'s fetch-wrapper pattern, extended with the new endpoint calls from
  03-api-plan.md.
- `types.ts` — replaced/expanded with the new domain types (Offer, Bid, ListingResponse,
  Contract, per-role Profile types) in place of `Deal`/`MatchDeal`.

# Overview

## Source

Mockups (18 slides) for a METI / Millpont pilot to facilitate international buyer access to
specialty grains with sustainability attributes.

## Relationship to the current app

The current app (originally `meti-open-deposits`) is a two-sided **matching** app for
carbon/water/acres outcomes: propose a deal (buyer or seller) → admin/creator approval → boards →
express interest → per-negotiation status (`in-communication → in-negotiation → deal-made` /
`declined`) → chat. That shape — listing, board, express interest, negotiation, chat — carries
over directly to grain trading and does not need to be reinvented.

What's different, per the mockups:

- **The subject matter is physical grain**, not environmental credits: commodity (corn, soybeans,
  sorghum, wheat), volume (MT or bushels), moisture %, test weight, protein %, delivery window,
  harvest window — not carbon pools / emission sources / additionality.
- **Four distinct account roles**, each with its own onboarding wizard, dashboard, and vocabulary:
  - **U.S. Grower** — sells their own grain.
  - **Program Operator** — aggregates grain from enrolled growers *and* may also offer their own
    production. A grower can belong to a program operator's program.
  - **International Buyer** — posts requirements/bids, browses supply, imports grain.
  - **Service Provider** — offers services to the industry (logistics, inspection, financing,
    etc.). **OPEN QUESTION:** no registration/dashboard mockup exists for this role — the deck
    only shows it as a landing-page tile. Scope it (even minimally) before building its
    onboarding wizard; it's the one role with no reference screen.
- **Self-service registration**, not admin-linked. Today, a new Auth0 login gets an
  `auth0_users` row with `account_id = NULL` until an admin manually links it in the DB. The
  mockups show a full "Create Account" wizard per role (pages 3–5) — registration must provision
  the account and role-specific profile immediately, no admin step.
- **Sustainability attributes and conservation practices are still first-class** (non-GMO,
  low-CI, sustainable, traceability certification; no-till, cover crops, nutrient management,
  buffer strips) — this part maps closely onto the existing `practices` / taxonomy pattern, just
  with a grain-specific vocabulary instead of carbon/water taxonomy.
- **A scored matching engine** (page 18, "Signal Match Results") — not just a filtered candidate
  list like today's `_find_matches`, but a ranked match % with a stated rationale (location match,
  delivery window overlap, quality specs, seller reliability).
- **Admin dashboard becomes analytics-heavy** (page 17): GMV, volume over time, transactions,
  active buyers/sellers, volume-by-state map — beyond today's admin's simple pending/all deals
  list.
- **Production data tracking** for growers (page 7: "Production Data Progress — Basic 100%,
  Advanced 60%") — a new concept, not present today.

## Roles (for reference throughout these docs)

| Role | Mockup pages | Primary actions |
|---|---|---|
| U.S. Grower | 3, 7, 8, 9 | Create profile, offer grain, browse/respond to bids, track production data |
| Program Operator | 4, 10, 11, 12 | Enroll growers, aggregate + offer grain, browse/respond to bids |
| International Buyer | 5, 13, 14, 15, 16 | Set requirements, browse supply, place bids/RFQs, manage contracts |
| Service Provider | (landing tile only) | TBD |
| Admin | 17 | Marketplace-wide analytics, user/org/listing management, disputes |

## Infrastructure decisions already made by the user

- A **separate Supabase Postgres project** has been created for this work (distinct from METI's
  instance that the current app's `open_match` table lives in).
- **Reuse the existing Auth0 login flow** (same tenant/app registration, same Authlib
  integration pattern: `/login`, `/callback`, `/logout`, session cookie) — see
  [01-architecture.md](01-architecture.md) for what changes and what doesn't.

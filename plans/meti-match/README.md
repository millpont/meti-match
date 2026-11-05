# METI Match — build plan

Planning docs for turning this repo (currently a single-board carbon/water outcomes matching app,
now METI Match by Millpont) into the full platform: a
role-based international **grain** trading marketplace (corn, soybeans, sorghum, wheat), not
carbon/water credits.

Read in this order:

1. [00-overview.md](00-overview.md) — what we're building, roles, relationship to the current app
2. [01-architecture.md](01-architecture.md) — new Supabase project, Auth0 reuse, backend/frontend shape
3. [02-data-model.md](02-data-model.md) — tables, per-role profiles, offers/bids/contracts
4. [03-api-plan.md](03-api-plan.md) — endpoints per role/resource
5. [04-frontend-plan.md](04-frontend-plan.md) — routes/pages/components per mockup screen
6. [05-roadmap.md](05-roadmap.md) — phased build order

Open questions are called out inline as `**OPEN QUESTION:**` — resolve before starting the phase
that depends on them.

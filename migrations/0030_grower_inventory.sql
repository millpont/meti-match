-- Grower Inventory: a farm-level cap on total volume per commodity per marketing year, drawn
-- down by BOTH the grower's own published Offers AND their accepted/in-flight bid-responses
-- (the client explicitly asked for a shared pool, not just Offers) — see
-- backend/inventory_routes.py's committed_volume(), which live-sums both sources fresh every
-- call rather than storing/decrementing a running balance, the same self-healing pattern as
-- enrollments_routes.py's committed_acres.
--
-- listing_responses.marketing_year is set only when a GROWER responds to a BUYER's bid (the
-- popup asks which marketing-year bucket the response amount draws from) — null for every other
-- response, since only that direction draws on grower_inventory.

begin;

create table if not exists public.grower_inventory (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.accounts(id) on delete cascade,
  commodity      text not null,
  marketing_year text not null,
  total_volume   numeric not null,
  uom            text not null check (uom in ('bushels', 'MT')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (account_id, commodity, marketing_year)
);

alter table public.grower_inventory enable row level security;

alter table public.listing_responses
  add column if not exists marketing_year text;

commit;

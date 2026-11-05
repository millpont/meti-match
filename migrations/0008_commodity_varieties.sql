-- Commodity variety/class (e.g. wheat's Hard Red Winter vs Soft White) — a real trade
-- distinction that matters more for milling/feed suitability than the bare commodity name.
-- Kept as a plain nullable text column, not an enum: the valid set depends on which commodity
-- is selected (see frontend/src/listings/constants.ts's COMMODITY_VARIETIES), same
-- app-enforced-vocabulary approach this codebase already uses for practices/attributes.

begin;

alter table public.offers add column if not exists variety text;
alter table public.bids add column if not exists variety text;

commit;

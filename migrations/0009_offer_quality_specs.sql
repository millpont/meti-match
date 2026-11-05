-- Quality specs + minimum order on an offer — matches the richer supply-search card design
-- (volume vs. min. order, protein %, moisture % max), distinct from a bid's simpler shape since
-- these describe the physical grain being offered, not a buyer's demand-side request.

begin;

alter table public.offers
  add column if not exists protein_pct numeric,
  add column if not exists moisture_pct_max numeric,
  add column if not exists min_order numeric;

commit;

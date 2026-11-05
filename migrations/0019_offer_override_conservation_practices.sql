-- Conservation practices now live on production_data (per commodity, see
-- 0018_production_data_conservation_practices.sql) instead of being a plain always-shown field
-- on the offer itself. This adds the matching per-listing override, same tri-state pattern as
-- the other override_* columns: NULL means "inherit the commodity default", a (possibly empty)
-- array means this listing explicitly overrides it. See resolve_production() in
-- production_data_routes.py, which already merges any override_* column generically.
--
-- offers.conservation_practices (the old direct field) is left in place, unused going forward —
-- same precedent as grower_profiles.conservation_practices in 0018.

begin;

alter table public.offers
  add column if not exists override_conservation_practices text[];

commit;

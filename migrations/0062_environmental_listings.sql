-- Carbon & environmental-data listings: bids and offers are no longer grain-only. A listing now
-- carries an asset_class ('grain' | 'carbon' | 'environmental'); non-grain listings name one
-- outcome_type, modeled on meti-v2's Match page outcomes (see backend/environmental.py for the
-- catalog — labels, units, and which asset class each belongs to).
--
-- Conventions for a non-grain listing (so responses, chat, contracts, notifications and the
-- inventory pools all keep working unchanged):
--   * commodity  = the outcome's display label (e.g. 'Carbon Removals'). It never collides with a
--                  crop name, so it can't draw on a grower's grain/acres inventory.
--   * quantity / expected_volume is in the outcome's own unit (tCO2e, acre-ft, lbs, acres, MT),
--     recorded in offers.uom; bids derive the unit from outcome_type.
--   * bid_price_usd_per_mt / desired_price are USD per that unit.
--   * bids.bid_type = 'environmental_outcome'; offers.quantity_basis = 'outcome'.
--   * source_commodities = the crops the outcome is associated with (optional), vintage_years =
--     the reporting/vintage years, source_states = US states the outcome originates from.

begin;

alter table public.bids
  add column if not exists asset_class text not null default 'grain'
    check (asset_class in ('grain', 'carbon', 'environmental')),
  add column if not exists outcome_type text
    check (outcome_type in (
      'reductions_t', 'removals_t', 'ci_commodity_t',
      'water_quantity', 'water_quality_n', 'water_quality_p', 'water_quality_tss', 'acres'
    )),
  add column if not exists vintage_years text[] not null default '{}',
  add column if not exists source_states text[] not null default '{}',
  add column if not exists source_commodities text[] not null default '{}',
  add column if not exists methodology text;

alter table public.offers
  add column if not exists asset_class text not null default 'grain'
    check (asset_class in ('grain', 'carbon', 'environmental')),
  add column if not exists outcome_type text
    check (outcome_type in (
      'reductions_t', 'removals_t', 'ci_commodity_t',
      'water_quantity', 'water_quality_n', 'water_quality_p', 'water_quality_tss', 'acres'
    )),
  add column if not exists vintage_years text[] not null default '{}',
  add column if not exists source_states text[] not null default '{}',
  add column if not exists source_commodities text[] not null default '{}',
  add column if not exists methodology text,
  add column if not exists data_attributes text[] not null default '{}';

-- A grain listing never has an outcome; a carbon/environmental one always does.
alter table public.bids drop constraint if exists bids_outcome_matches_asset_class;
alter table public.bids add constraint bids_outcome_matches_asset_class
  check ((asset_class = 'grain') = (outcome_type is null));
alter table public.offers drop constraint if exists offers_outcome_matches_asset_class;
alter table public.offers add constraint offers_outcome_matches_asset_class
  check ((asset_class = 'grain') = (outcome_type is null));

alter table public.bids drop constraint if exists bids_bid_type_check;
alter table public.bids add constraint bids_bid_type_check
  check (bid_type in ('available_grain', 'acres_for_contracting', 'volumes_for_contracting', 'environmental_outcome'));

alter table public.offers drop constraint if exists offers_uom_check;
alter table public.offers add constraint offers_uom_check
  check (uom in ('bushels', 'MT', 'tCO2e', 'acre-ft', 'lbs', 'acres'));

alter table public.offers drop constraint if exists offers_quantity_basis_check;
alter table public.offers add constraint offers_quantity_basis_check
  check (quantity_basis in ('grain', 'acres', 'outcome'));

create index if not exists bids_asset_class_idx on public.bids (asset_class);
create index if not exists offers_asset_class_idx on public.offers (asset_class);

commit;

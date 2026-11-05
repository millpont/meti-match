-- Offer segmentation: two independent axes, not one.
--   quantity_basis: how the quantity is specified — 'grain' (Total Volume + uom, as today) or
--     'acres' (Acres + Yield rate + yield unit; no Total Volume input — backend computes it).
--   listing_timing: when it's ready — 'available' (in hand now) or 'future' (not yet
--     harvested/projected). Orthogonal to quantity_basis; drives Marketing Year's default and
--     makes Expected Date of Delivery required.
--
-- Also renames crop_year -> marketing_year (going forward the app writes "2025-2026" instead of
-- "2025" — a clean rename, not a compat shim) and adds Expected Date of Delivery + the
-- Acres/hectares area_unit tag (bullet 7 — the stored acres_offered value itself always stays
-- normalized to acres; area_unit is display-only, never read by backend math).

begin;

alter table public.offers rename column crop_year to marketing_year;

alter table public.offers
  add column if not exists quantity_basis text not null default 'grain'
    check (quantity_basis in ('grain', 'acres')),
  add column if not exists listing_timing text not null default 'available'
    check (listing_timing in ('available', 'future')),
  add column if not exists expected_delivery_date date,
  add column if not exists area_unit text check (area_unit in ('acres', 'hectares')),
  add column if not exists yield_rate numeric,
  add column if not exists yield_unit text check (yield_unit in ('bu/acre', 'MT/acre', 'lbs/acre'));

commit;

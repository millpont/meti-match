-- A buyer's "Acres for Contracting" bid had no way to say acres vs hectares — quantity was just
-- a bare number, implicitly always acres. Mirrors offers.area_unit (display-only; quantity
-- itself is always normalized to acres before storage, same convention as offers.acres_offered).
-- Only meaningful when bid_type='acres_for_contracting'.

begin;

alter table public.bids
  add column if not exists area_unit text check (area_unit in ('acres', 'hectares'));

commit;

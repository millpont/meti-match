-- Acres-segment Yield Unit: swap MT/acre for MT/hectare (metric growers think in MT/ha, not
-- MT/acre) — bu/acre and lbs/acre stay as-is. This is the offer's own top-level yield_unit
-- (drives the Acres-for-Planting quantity calc), NOT override_yield_unit (production-data's
-- separate yield-rate override field, which keeps its existing bu/acre + MT/acre pair).

begin;

alter table public.offers drop constraint offers_yield_unit_check;
alter table public.offers add constraint offers_yield_unit_check
  check (yield_unit in ('bu/acre', 'MT/hectare', 'lbs/acre'));

commit;

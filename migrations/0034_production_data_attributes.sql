-- Conservation practices have had a per-commodity default on production_data since 0018; the
-- other two taxonomy pickers offers already carry per-listing (sustainability_attributes,
-- specialty_attributes — see 0007/attributes taxonomy) never got the same default-capture
-- treatment. This just fills that gap so OfferForm can pre-fill a new listing from whatever
-- the grower already told the app about this commodity, instead of always starting blank.

begin;

alter table public.production_data
  add column if not exists sustainability_attributes text[] not null default '{}',
  add column if not exists specialty_attributes text[] not null default '{}';

commit;

-- Bid richness: a bid's requirement set was asymmetric with a buyer's standing "requirements"
-- profile (buyer_requirements already has attributes + practices + certification_required; a
-- one-off bid only ever had required_attributes). Brings bids up to the same three families,
-- plus a 4th ("data requirements" — see migrations/0027) that's stored/displayed but not yet
-- scored in matching (client's own "future vision" framing).
--
-- Also adds a per-attribute free-text note (so a buyer can qualify e.g. "Water efficient" with
-- "Must use drip irrigation technologies"), and allow_partial ("unless the Buyer requires only
-- full amount" — the amount-picker popup in a later migration checks this).

begin;

alter table public.bids
  add column if not exists required_practices text[] not null default '{}',
  add column if not exists required_certifications text[] not null default '{}',
  add column if not exists required_data_requirements text[] not null default '{}',
  add column if not exists required_attribute_notes jsonb not null default '{}',
  add column if not exists allow_partial boolean not null default true;

commit;

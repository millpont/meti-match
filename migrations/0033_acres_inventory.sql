-- Acres inventory: "contracting acres should follow the same inventory logic" as grain. Extends
-- grower_inventory with a quantity_basis dimension mirroring offers' own split (see
-- migrations/0029_offer_segmentation.sql) rather than a separate table — same account/commodity/
-- marketing-year identity, just a second pool a grower can hold alongside their grain balance.

begin;

alter table public.grower_inventory
  add column if not exists quantity_basis text not null default 'grain'
    check (quantity_basis in ('grain', 'acres')),
  add column if not exists total_acres numeric,
  add column if not exists area_unit text check (area_unit in ('acres', 'hectares'));

alter table public.grower_inventory
  alter column total_volume drop not null,
  alter column uom drop not null;

alter table public.grower_inventory drop constraint grower_inventory_account_id_commodity_marketing_year_key;
alter table public.grower_inventory add constraint grower_inventory_account_commodity_year_basis_key
  unique (account_id, commodity, marketing_year, quantity_basis);

alter table public.grower_inventory add constraint grower_inventory_basis_fields_check check (
  (quantity_basis = 'grain' and total_volume is not null and uom is not null and total_acres is null and area_unit is null)
  or
  (quantity_basis = 'acres' and total_acres is not null and area_unit is not null and total_volume is null and uom is null)
);

commit;

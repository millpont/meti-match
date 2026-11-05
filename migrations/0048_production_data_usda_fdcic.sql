-- USDA Feedstock Carbon Intensity Calculator (FD-CIC) advanced production criteria -- scoped to
-- the Production Data page only (no offer-side override_* mirrors, per the literal request).
alter table production_data add column if not exists nitrogen_lbs_per_acre numeric;
alter table production_data add column if not exists nitrification_inhibitor_fraction numeric;
alter table production_data add column if not exists synthetic_phosphorus_lbs_per_acre numeric;
alter table production_data add column if not exists synthetic_potassium_lbs_per_acre numeric;
alter table production_data add column if not exists lime_dolomite_lbs_per_acre numeric;
alter table production_data add column if not exists herbicide_lbs_per_acre numeric;
alter table production_data add column if not exists insecticide_lbs_per_acre numeric;
alter table production_data add column if not exists fungicide_lbs_per_acre numeric;
alter table production_data add column if not exists manure_lbs_per_acre numeric;
alter table production_data add column if not exists manure_type text
  check (manure_type in ('dairy', 'beef', 'swine', 'poultry') or manure_type is null);
alter table production_data add column if not exists tdisc_score numeric;
alter table production_data add column if not exists diesel_gal_per_acre numeric;
alter table production_data add column if not exists gasoline_gal_per_acre numeric;
alter table production_data add column if not exists natural_gas_total_therms numeric;
alter table production_data add column if not exists lpg_total_gallons numeric;
alter table production_data add column if not exists electricity_kwh_per_acre numeric;

-- Additive -- existing practice terms (Grazing: Rotational grazing, Cover Crops, Soil Cover:
-- Cover crops (100%)) stay as-is.
insert into taxonomy_terms (type, label) values ('practice', 'Cover Crops: Grazing')
on conflict (type, label) do nothing;

-- Reworks production_data from one flat row per grower account to one row per (grower,
-- commodity) — a grower who grows both corn and soybeans needs separate practice records, not
-- one flattened set of numbers. Also adds per-offer overrides: a specific listing can differ
-- from the grower's usual per-commodity practices (a different field, a one-off irrigation
-- change, etc.) without altering the standing default.
--
-- No data migration needed — production_data was empty (feature had just shipped, unused).

begin;

drop table if exists public.production_data;

create table public.production_data (
  account_id            uuid not null references public.accounts(id) on delete cascade,
  commodity             text not null,
  actual_yield_per_acre numeric,
  irrigation_type       text check (irrigation_type in ('dryland', 'rainfed', 'irrigated')),
  crop_rotation_years   numeric,
  soil_test_on_file     boolean not null default false,
  third_party_verified  boolean not null default false,
  input_usage_notes     text,
  updated_at            timestamptz not null default now(),
  primary key (account_id, commodity)
);

-- Per-listing overrides on offers — null means "inherit this grower's per-commodity
-- production_data default for offers.commodity"; a non-null value overrides it for this
-- listing only, without touching the standing default.
alter table public.offers
  add column if not exists override_actual_yield_per_acre numeric,
  add column if not exists override_irrigation_type text
    check (override_irrigation_type in ('dryland', 'rainfed', 'irrigated')),
  add column if not exists override_crop_rotation_years numeric,
  add column if not exists override_soil_test_on_file boolean,
  add column if not exists override_third_party_verified boolean,
  add column if not exists override_input_usage_notes text;

commit;

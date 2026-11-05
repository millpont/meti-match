-- METI Open Match — demo market seed.
-- Populates the Bid/Offer boards with realistic, mutually-matching listings modeled on real METI
-- data (Corn/Soybean CI in IA/IL/NY, 2024, ISO 14064/65) so a first-time user can see and exercise
-- market activity immediately. Safe to run in the Supabase SQL editor.
--
-- Idempotent: re-running replaces the demo set. To REMOVE all demo data:
--     delete from public.open_match where source_tag = 'demo';
--
-- Owning accounts are real METI custodians so the created_by FK holds. Two listings are owned by
-- MillPont with pre-seeded interest so the Matches tab has something to act on out of the box.

begin;

-- Provenance tag so demo rows are identifiable and removable (invisible to the app).
alter table public.open_match add column if not exists source_tag text;

-- Fresh start on every run.
delete from public.open_match where source_tag = 'demo';

insert into public.open_match
  (created_by, account_type, country, state, commodity, year,
   ci_commodity_t, reductions_t, removals_t, acres,
   outcome_pricing, carbon_pools, credit_character, stratum, additionality,
   is_approved, matches, match_statuses, source_tag)
values
-- ============================ OFFER BOARD (sellers / supply) ============================
-- AgriCapture — IA corn CI-reduced grain (from a ~465-acre, 117k-bu field)
('d89bfaa4-fd4c-44d3-80be-4abaf62b6166','seller','USA','{IA}','{Corn/Maize}','{2024}',
  2986, null, null, 464.64,
  '{"ci_commodity_t":{"floor":20,"ceiling":35}}','{SOC_MINERAL}','{REDUCTION}','CROPLAND','ESTABLISHED',
  true, '{}', '{}'::jsonb, 'demo'),

-- Continuum Ag — IA corn soil-carbon reductions
('d5b5a62e-ae90-4c23-97db-e62ede03d395','seller','USA','{IA}','{Corn/Maize}','{2024}',
  null, 1200, null, 405.37,
  '{"reductions_t":{"floor":18,"ceiling":40}}','{SOC_MINERAL}','{REDUCTION}','CROPLAND','ESTABLISHED',
  true, '{}', '{}'::jsonb, 'demo'),

-- Arva Intelligence — IA soybean CI-reduced grain
('6e0927bd-e7f1-4b20-9dfc-8375a9c38387','seller','USA','{IA}','{Soybeans}','{2024}',
  640, null, null, 356.90,
  '{"ci_commodity_t":{"floor":22,"ceiling":38}}','{SOC_MINERAL}','{REDUCTION}','CROPLAND','ESTABLISHED',
  true, '{}', '{}'::jsonb, 'demo'),

-- Cultivo — IL corn soil-carbon removals / sequestration
('bc51658b-159c-4575-9ca6-f264e00826cd','seller','USA','{IL}','{Corn/Maize}','{2024}',
  null, null, 800, 410.09,
  '{"removals_t":{"floor":30,"ceiling":55}}','{SOC_MINERAL,AGB_HERBACEOUS}','{REMOVAL,SEQUESTRATION}','CROPLAND','ESTABLISHED',
  true, '{}', '{}'::jsonb, 'demo'),

-- Grand Prairie Marketing & Trading — NY soybean CI grain
('c036ea39-c9a4-4492-ae36-4c28edf0059f','seller','USA','{NY}','{Soybeans}','{2024}',
  630, null, null, 365.81,
  '{"ci_commodity_t":{"floor":20,"ceiling":34}}','{SOC_MINERAL}','{REDUCTION}','CROPLAND','NOT_ESTABLISHED',
  true, '{}', '{}'::jsonb, 'demo'),

-- Karbnz — IA corn CI grain, prior vintage (2023)
('5dfdd4b5-3d77-45b9-b0fb-18eda6d13f6e','seller','USA','{IA}','{Corn/Maize}','{2023}',
  2100, null, null, 340.58,
  '{"ci_commodity_t":{"floor":19,"ceiling":33}}','{SOC_MINERAL}','{REDUCTION}','CROPLAND','ESTABLISHED',
  true, '{}', '{}'::jsonb, 'demo'),

-- ============================ BID BOARD (buyers / demand) ============================
-- Cargill — wants IA corn CI grain 2024 (matches AgriCapture)
('b639306d-4542-4966-a992-3b79fc62d4f9','buyer','USA','{IA}','{Corn/Maize}','{2024}',
  2000, null, null, null,
  '{"ci_commodity_t":{"floor":22,"ceiling":40}}','{SOC_MINERAL}','{REDUCTION}','CROPLAND','ESTABLISHED',
  true, '{}', '{}'::jsonb, 'demo'),

-- Contoso — wants IA soybean CI grain 2024 (matches Arva)
('77109a6d-031a-4060-8c32-1b5a603a4c59','buyer','USA','{IA}','{Soybeans}','{2024}',
  500, null, null, null,
  '{"ci_commodity_t":{"floor":24,"ceiling":40}}','{SOC_MINERAL}','{REDUCTION}','CROPLAND','ESTABLISHED',
  true, '{}', '{}'::jsonb, 'demo'),

-- ABC Corp — wants IL corn removals 2024 (matches Cultivo)
('8e106cc4-2eb1-4ebf-b9c0-97471c7606d5','buyer','USA','{IL}','{Corn/Maize}','{2024}',
  null, null, 500, null,
  '{"removals_t":{"floor":35,"ceiling":60}}','{SOC_MINERAL}','{REMOVAL}','CROPLAND','ESTABLISHED',
  true, '{}', '{}'::jsonb, 'demo'),

-- Kateri — wants IA corn reductions 2024 (matches Continuum Ag)
('8257b989-eff4-4dd4-99ac-927d20492146','buyer','USA','{IA}','{Corn/Maize}','{2024}',
  null, 1000, null, null,
  '{"reductions_t":{"floor":20,"ceiling":45}}','{SOC_MINERAL}','{REDUCTION}','CROPLAND','ESTABLISHED',
  true, '{}', '{}'::jsonb, 'demo'),

-- Cargill — wants NY soybean CI grain 2024 (matches Grand Prairie)
('b639306d-4542-4966-a992-3b79fc62d4f9','buyer','USA','{NY}','{Soybeans}','{2024}',
  600, null, null, null,
  '{"ci_commodity_t":{"floor":22,"ceiling":36}}','{SOC_MINERAL}','{REDUCTION}','CROPLAND','NOT_ESTABLISHED',
  true, '{}', '{}'::jsonb, 'demo'),

-- ================= MillPont-owned, with interest already expressed (Matches tab) =================
-- Your offer with two interested buyers — one already in communication, one pending.
('22bcddb8-fee7-4fb2-b03a-f8136c0f44b3','seller','USA','{IA}','{Corn/Maize}','{2024}',
  1500, null, null, 300.00,
  '{"ci_commodity_t":{"floor":20,"ceiling":36}}','{SOC_MINERAL}','{REDUCTION}','CROPLAND','ESTABLISHED',
  true,
  '{b639306d-4542-4966-a992-3b79fc62d4f9,d5b5a62e-ae90-4c23-97db-e62ede03d395}',
  '{"b639306d-4542-4966-a992-3b79fc62d4f9":"in-communication"}'::jsonb,
  'demo'),

-- Your bid with one interested seller (pending your first move).
('22bcddb8-fee7-4fb2-b03a-f8136c0f44b3','buyer','USA','{IL}','{Soybeans}','{2024}',
  800, null, null, null,
  '{"ci_commodity_t":{"floor":24,"ceiling":42}}','{SOC_MINERAL}','{REDUCTION}','CROPLAND','ESTABLISHED',
  true,
  '{6e0927bd-e7f1-4b20-9dfc-8375a9c38387}',
  '{}'::jsonb,
  'demo');

commit;

-- Summary: 6 offers, 5 bids, 2 MillPont-owned listings with live interest = 13 demo listings.
-- Remove anytime with:  delete from public.open_match where source_tag = 'demo';

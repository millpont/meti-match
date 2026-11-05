-- Activity / methodology taxonomy on a listing — mirrors source_activity_taxonomy from METI's
-- Conflicts page (carbon pools, emission sources, credit character, additionality, stratum).
-- This lets a deal declare WHAT its activity actually accounts for, and lets the matching engine
-- require methodological compatibility (e.g. an above-ground-forest buyer won't be matched to a
-- soil-carbon seller).
--
-- Stored as text[]/text (not METI's enum types) so open_match stays self-contained and portable;
-- valid values are enforced in the app and mirror the METI enums.

begin;

alter table public.open_match
  add column if not exists carbon_pools     text[] not null default '{}',
  add column if not exists emission_sources text[] not null default '{}',
  add column if not exists credit_character text[] not null default '{}',
  add column if not exists additionality    text,
  add column if not exists stratum          text;

create index if not exists idx_open_match_carbon_pools
  on public.open_match using gin (carbon_pools);
create index if not exists idx_open_match_emission_sources
  on public.open_match using gin (emission_sources);

commit;

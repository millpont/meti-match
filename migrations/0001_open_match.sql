-- METI Open Match — standalone marketplace table.
-- Cloned/redesigned from meti_match. Lives in the SAME Supabase instance as METI but is a
-- fully separate table, so this app's data never touches meti_match.
--
-- References the SHARED accounts table (created_by, matches[]) and, indirectly, auth0_users
-- for the login->account mapping — deliberately reused because this app shares METI's Auth0.
--
-- Improvements over the original meti_match:
--   * year is a real text[] (the original stored a comma-joined string, inconsistent with
--     the other array columns).
--   * account_type / match statuses are constrained.
--   * is_approved has an index so the boards query stays fast.
--   * no deposits column for v1 (the original referenced meti_docs, which this app has no UI for).

begin;

create table if not exists public.open_match (
  id                uuid primary key default gen_random_uuid(),
  created_by        uuid not null references public.accounts(id),
  account_type      text not null check (account_type in ('buyer', 'seller')),

  -- what/where/when
  country           text not null,
  state             text[]  not null default '{}',
  region            text[]  not null default '{}',
  commodity         text[]  not null default '{}',
  year              text[]  not null default '{}',

  -- outcome quantities (nullable; a listing prices any subset)
  ci_commodity_t    numeric,
  reductions_t      numeric,
  removals_t        numeric,
  water_quantity    numeric,
  water_quality_n   numeric,
  water_quality_p   numeric,
  water_quality_tss numeric,
  acres             numeric,

  -- pricing / qualifiers
  outcome_pricing   jsonb,      -- { outcomeType: { floor, ceiling } }
  practices         jsonb,      -- { selected: [], other: str|null }
  additional_data   jsonb,      -- array of pricing-influence strings

  -- marketplace state
  is_approved       boolean not null default false,
  matches           text[]  not null default '{}',   -- account_ids that expressed interest
  match_statuses    jsonb   not null default '{}'::jsonb,  -- { account_id: status }

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Boards query: approved deals of a given type, newest first.
create index if not exists idx_open_match_board
  on public.open_match (is_approved, account_type, created_at desc);

-- "my deals" and "deals I expressed interest in".
create index if not exists idx_open_match_created_by on public.open_match (created_by);
create index if not exists idx_open_match_matches on public.open_match using gin (matches);

commit;

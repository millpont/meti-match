-- METI Match — identity schema for the NEW, standalone Supabase project.
--
-- Unlike 0001-0003, which extend `open_match` in METI's shared Supabase instance (where
-- `accounts`/`auth0_users` were borrowed tables), this migration targets a *separate* Supabase
-- project created for the METI Match rebuild. `accounts` and `auth0_users` are therefore
-- recreated here from scratch rather than referenced — this project owns its full schema.
--
-- See plans/meti-match/02-data-model.md for the full design and rationale, and
-- plans/meti-match/05-roadmap.md (Phase 0) for what this migration covers vs. later
-- phases (offers/bids/responses/contracts/production data land in their own migrations as each
-- phase is built).
--
-- Apply this to the METI Match project's Postgres, NOT the original METI/open_match instance:
--   psql "$METI_MATCH_DB_URL" -f migrations/0004_grain_identity.sql

begin;

-- ------------------------------------------------------------------------- accounts

create table if not exists public.accounts (
  id         uuid primary key default gen_random_uuid(),
  role       text not null check (role in (
               'grower', 'program_operator', 'international_buyer',
               'service_provider', 'admin'
             )),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------- auth0_users

-- account_id is nullable until the self-service onboarding wizard completes (see auth.py /
-- onboarding_routes.py) — a first-time login gets a row here with no account yet, and the
-- frontend routes them into the role picker rather than an "awaiting admin" state.
create table if not exists public.auth0_users (
  auth0_id   text primary key,
  account_id uuid references public.accounts(id),
  email      text not null default '',
  first_name text not null default '',
  last_name  text not null default ''
);

create index if not exists idx_auth0_users_account_id on public.auth0_users (account_id);

-- ------------------------------------------------------------------------- role profiles
-- One row per account, account_id doubles as PK and FK — enforced 1:1 with its account.

create table if not exists public.grower_profiles (
  account_id             uuid primary key references public.accounts(id) on delete cascade,
  farm_name              text not null,
  state                  text not null,
  county                 text,
  total_acres            numeric,
  primary_crops          text[] not null default '{}',   -- corn, soybeans, sorghum, wheat
  conservation_practices text[] not null default '{}',   -- no-till, cover crops, nutrient management
  program_affiliation    uuid references public.accounts(id),  -- set once enrolled by a program operator
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.program_operator_profiles (
  account_id               uuid primary key references public.accounts(id) on delete cascade,
  organization_name        text not null,
  organization_type        text,
  states_covered           text[] not null default '{}',
  aggregates_from_growers  boolean not null default false,
  offers_own_grain         boolean not null default false,
  own_farm_acres           numeric,
  verified_practices       text[] not null default '{}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table if not exists public.international_buyer_profiles (
  account_id               uuid primary key references public.accounts(id) on delete cascade,
  company_name             text not null,
  country                  text not null,
  sector                   text,   -- Food, Feed, Pet Food, Aquaculture
  annual_purchase_volume_mt numeric,
  commodities_of_interest  text[] not null default '{}',
  required_attributes      text[] not null default '{}',  -- non-GMO, low-CI, sustainable, traceability
  destination_ports        text[] not null default '{}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Placeholder shape — no mockup screen defines these fields yet.
-- See plans/meti-match/00-overview.md's open question before building its onboarding wizard.
create table if not exists public.service_provider_profiles (
  account_id      uuid primary key references public.accounts(id) on delete cascade,
  company_name    text not null,
  services_offered text[] not null default '{}',
  states_covered  text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ------------------------------------------------------------------------- program enrollments

-- A program operator aggregates MULTIPLE growers — this is its own table (not folded into
-- grower_profiles) so one operator can list many. grower_account_id is nullable: an operator can
-- enroll a grower who isn't a platform account yet, tracked by name only until they sign up.
create table if not exists public.program_enrollments (
  id                          uuid primary key default gen_random_uuid(),
  program_operator_account_id uuid not null references public.accounts(id) on delete cascade,
  grower_account_id           uuid references public.accounts(id),
  grower_name_freeform        text,
  farms_count                 integer,
  acres_enrolled               numeric,
  primary_practices           text[] not null default '{}',
  enrollment_date              date not null default current_date,
  status                       text not null default 'pending' check (status in ('active', 'pending')),
  created_at                   timestamptz not null default now(),
  check (grower_account_id is not null or grower_name_freeform is not null)
);

create index if not exists idx_program_enrollments_operator
  on public.program_enrollments (program_operator_account_id);
create index if not exists idx_program_enrollments_grower
  on public.program_enrollments (grower_account_id);

commit;

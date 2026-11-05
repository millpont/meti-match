-- METI Match — Phase 6: contracts (created when a response is accepted) and grower
-- production data. See plans/meti-match/02-data-model.md.
--
-- Resolves the "what belongs in Advanced Production Data" open question: the mockup's "Basic
-- Production Data" bar is just what's already collected at onboarding (grower_profiles), always
-- 100% once a grower account exists — no new storage needed for it. "Advanced" is a handful of
-- fields relevant to verifying the sustainability/quality claims a grower's offers make (yield,
-- irrigation, rotation history, verification status), scored by how many are filled in.

begin;

create table if not exists public.contracts (
  id                     uuid primary key default gen_random_uuid(),
  response_id            uuid not null unique references public.listing_responses(id) on delete cascade,
  seller_account_id      uuid not null references public.accounts(id),
  buyer_account_id       uuid not null references public.accounts(id),
  commodity              text not null,
  variety                text,
  final_volume           numeric,
  final_price_usd_per_mt numeric,
  delivery_window_start  date,
  delivery_window_end    date,
  status                 text not null default 'pending' check (status in ('pending', 'shipped', 'completed')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_contracts_seller on public.contracts (seller_account_id);
create index if not exists idx_contracts_buyer on public.contracts (buyer_account_id);

create table if not exists public.production_data (
  account_id             uuid primary key references public.accounts(id) on delete cascade,
  actual_yield_per_acre  numeric,
  irrigation_type        text check (irrigation_type in ('dryland', 'rainfed', 'irrigated')),
  crop_rotation_years    numeric,
  soil_test_on_file      boolean not null default false,
  third_party_verified   boolean not null default false,
  input_usage_notes      text,
  updated_at             timestamptz not null default now()
);

commit;

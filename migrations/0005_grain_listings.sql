-- METI Match — listings schema (Phase 2): supply-side offers, demand-side bids, and the
-- generalized response/negotiation table that replaces the old open_match jsonb matches/
-- match_statuses approach. See plans/meti-match/02-data-model.md for the full design.
--
-- Bids' create/list endpoints exist starting this phase (see 03-api-plan.md) even though the
-- buyer-facing UI doesn't land until Phase 3 — growers' "browse bids" (Phase 2) needs real data
-- to work against; seeds/grain_demo.sql seeds a demo buyer + bids for that purpose.

begin;

create table if not exists public.offers (
  id                        uuid primary key default gen_random_uuid(),
  created_by                uuid not null references public.accounts(id),
  commodity                 text not null,
  crop_year                 text,
  expected_volume           numeric not null,
  uom                       text not null check (uom in ('bushels', 'MT')),
  acres_offered             numeric,
  price_type                text check (price_type in ('fixed', 'basis')),
  desired_price             numeric,
  harvest_start             date,
  harvest_end               date,
  sustainability_attributes text[] not null default '{}',
  conservation_practices    text[] not null default '{}',
  specialty_attributes      text[] not null default '{}',
  location_state            text,
  location_county           text,
  certifications            text[] not null default '{}',
  status                    text not null default 'draft'
                              check (status in ('draft', 'published', 'accepted', 'withdrawn')),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists idx_offers_board on public.offers (status, commodity, created_at desc);
create index if not exists idx_offers_created_by on public.offers (created_by);

create table if not exists public.bids (
  id                     uuid primary key default gen_random_uuid(),
  created_by             uuid not null references public.accounts(id),
  commodity              text not null,
  bid_type               text not null
                           check (bid_type in ('available_grain', 'acres_for_contracting', 'volumes_for_contracting')),
  quantity               numeric not null,  -- MT for available_grain/volumes_for_contracting, acres for acres_for_contracting
  bid_price_usd_per_mt   numeric,
  delivery_window_start  date,
  delivery_window_end    date,
  required_attributes    text[] not null default '{}',
  destination_country    text,
  status                 text not null default 'open' check (status in ('open', 'closed')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_bids_board on public.bids (status, commodity, created_at desc);
create index if not exists idx_bids_created_by on public.bids (created_by);

-- listing_id is polymorphic (points into offers or bids per listing_type) — no direct FK, same
-- app-enforced-integrity tradeoff the rest of this codebase already makes for jsonb/array
-- columns; kept simple rather than adding a trigger for a two-way polymorphic reference.
create table if not exists public.listing_responses (
  id                    uuid primary key default gen_random_uuid(),
  listing_type          text not null check (listing_type in ('offer', 'bid')),
  listing_id            uuid not null,
  responder_account_id  uuid not null references public.accounts(id),
  proposed_price        numeric,
  proposed_volume       numeric,
  status                text not null default 'pending'
                          check (status in ('pending', 'in-communication', 'in-negotiation', 'accepted', 'declined')),
  match_score           numeric,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_listing_responses_listing on public.listing_responses (listing_type, listing_id);
create index if not exists idx_listing_responses_responder on public.listing_responses (responder_account_id);

commit;

-- METI Match — Phase 3: buyer requirements (standing profile of what a buyer is looking
-- for, distinct from a specific posted bid) and per-response chat. See
-- plans/meti-match/02-data-model.md.

begin;

create table if not exists public.buyer_requirements (
  account_id               uuid primary key references public.accounts(id) on delete cascade,
  volumes_min              numeric,
  volumes_max              numeric,
  commodities              text[] not null default '{}',
  attributes               text[] not null default '{}',
  practices                text[] not null default '{}',
  traceability_required    boolean not null default false,
  certification_required   text[] not null default '{}',
  production_data_required boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Per-negotiation chat for a listing_responses row. Same shape as the old open_match_messages:
-- the two participants are the listing's creator and the responder on that response.
create table if not exists public.listing_response_messages (
  id                uuid primary key default gen_random_uuid(),
  response_id       uuid not null references public.listing_responses(id) on delete cascade,
  sender_account_id uuid not null references public.accounts(id),
  body              text not null check (length(btrim(body)) > 0),
  created_at        timestamptz not null default now()
);

create index if not exists idx_listing_response_messages_thread
  on public.listing_response_messages (response_id, created_at);

commit;

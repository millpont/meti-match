-- Phase 10 Pass 2: a Grower/Buyer/Operator requests a service from a Service Provider, who
-- accepts or declines. Mirrors buyer_representations (migrations/0023) with one deliberate
-- difference: a decline is kept on file (status='declined'), not deleted — a service request is
-- a one-off inquiry, not a toggleable standing relationship, so the requester should be able to
-- see what happened and isn't blocked from asking again later. No unique constraint for the same
-- reason: repeat requests to the same provider over time are normal.

begin;

create table if not exists public.service_requests (
  id                          uuid primary key default gen_random_uuid(),
  requester_account_id        uuid not null references public.accounts(id) on delete cascade,
  service_provider_account_id uuid not null references public.accounts(id) on delete cascade,
  service_category            text,
  message                     text,
  status                      text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_service_requests_requester on public.service_requests (requester_account_id);
create index if not exists idx_service_requests_provider on public.service_requests (service_provider_account_id);

alter table public.service_requests enable row level security;

commit;

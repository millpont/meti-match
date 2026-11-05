-- Unlocks the Service Provider ("Trader") role and its two client-defined capabilities:
--
-- 1. "Contract on behalf of a buyer with its approval" — same on-behalf-of +
--    approval pattern already built for Program Operator -> Grower offers, mirrored onto bids.
--    No quantity cap (unlike the grower acres_enrolled cap) — buyers have no standing "enrolled
--    volume" concept to cap against.
-- 2. "Manage the execution of any agreement made by [a represented] buyer" — a
--    standing buyer_representations relationship (request/approve, mirrors program_enrollments'
--    grower-initiated affiliation) that, once active, gives the trader visibility into and
--    status-management rights over that buyer's contracts (see contracts_routes.py).
--
-- service_provider_profiles already exists (migration 0004) with nothing but defaultable
-- columns, so no schema change is needed there to start using it.

begin;

create table if not exists public.buyer_representations (
  id                        uuid primary key default gen_random_uuid(),
  service_provider_account_id uuid not null references public.accounts(id) on delete cascade,
  buyer_account_id          uuid not null references public.accounts(id) on delete cascade,
  status                    text not null default 'pending' check (status in ('active', 'pending')),
  created_at                timestamptz not null default now(),
  unique (service_provider_account_id, buyer_account_id)
);

create index if not exists idx_buyer_representations_sp on public.buyer_representations (service_provider_account_id);
create index if not exists idx_buyer_representations_buyer on public.buyer_representations (buyer_account_id);

alter table public.buyer_representations enable row level security;

alter table public.bids
  add column if not exists on_behalf_of_buyer_account_id uuid references public.accounts(id),
  add column if not exists buyer_approval_status text not null default 'not_required'
    check (buyer_approval_status in ('not_required', 'pending', 'approved', 'declined'));

create index if not exists idx_bids_on_behalf_of on public.bids (on_behalf_of_buyer_account_id);

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'response_received', 'status_changed', 'message_received', 'dispute_raised', 'dispute_resolved',
  'offer_approval_requested', 'offer_approved', 'offer_declined',
  'bid_approval_requested', 'bid_approved', 'bid_declined',
  'representation_requested', 'representation_approved', 'representation_declined'
));

commit;

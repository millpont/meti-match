-- Multiple logins per company. auth0_users.account_id already has no unique constraint, so
-- several auth0_users rows CAN already point at one accounts row with no schema change — this
-- migration adds the missing piece: who is allowed to approve a new login onto a company's
-- account, and what a pending "join this company" request looks like as data.
--
-- The first person to create a company (accounts row) becomes that company's admin, able to
-- approve or decline later logins that ask to join. A superadmin can always decide these too
-- (see auth.is_superadmin's bootstrap fallback).

begin;

alter table public.auth0_users
  add column if not exists is_company_admin boolean not null default false;

create table if not exists public.account_join_requests (
  id           uuid primary key default gen_random_uuid(),
  auth0_id     text not null references public.auth0_users(auth0_id) on delete cascade,
  account_id   uuid not null references public.accounts(id) on delete cascade,
  role         text not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by_account_id uuid references public.accounts(id)
);

-- One live (pending) request per login at a time — resubmitting after a decline is fine, it's
-- only "still waiting on someone" that's capped at one.
create unique index if not exists idx_account_join_requests_one_pending_per_user
  on public.account_join_requests (auth0_id) where status = 'pending';

create index if not exists idx_account_join_requests_account on public.account_join_requests (account_id) where status = 'pending';

alter table public.account_join_requests enable row level security;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'response_received', 'status_changed', 'message_received', 'dispute_raised', 'dispute_resolved',
  'offer_approval_requested', 'offer_approved', 'offer_declined',
  'bid_approval_requested', 'bid_approved', 'bid_declined',
  'representation_requested', 'representation_approved', 'representation_declined',
  'join_request_received', 'join_request_approved'
));

commit;

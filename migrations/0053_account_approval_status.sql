-- Superadmin approval for brand-new accounts. Until now a new email registering a new company was
-- fully active immediately (see onboarding_routes.py's _create_account_and_link) -- there was no
-- pending/approval concept on `accounts` at all, only frozen/frozen_reason.
--
-- This column is DORMANT by design: it defaults to 'approved', and the application only ever writes
-- 'pending' when config.ACCOUNT_APPROVAL_REQUIRED is turned on (off by default, so first-round
-- testing users are never blocked). Every existing account is therefore already approved, and with
-- the flag off nothing about signup behaviour changes.
--
-- Note this is for NEW accounts only. Someone joining an EXISTING company already goes through that
-- company's admin via account_join_requests (migrations/0024) -- a separate, already-live flow.
alter table accounts add column if not exists approval_status text not null default 'approved'
  check (approval_status in ('pending', 'approved', 'declined'));
alter table accounts add column if not exists approval_decided_at timestamptz;
alter table accounts add column if not exists approval_decided_by_account_id uuid references accounts(id);
alter table accounts add column if not exists approval_note text;

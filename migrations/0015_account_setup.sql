-- Faster account setup: signup collects a person's name, company/organization name, the last 4
-- digits of the company's EIN, phone, and email UP FRONT, then the role is picked and the
-- account is created immediately (no more per-role wizard asking for farm state, buyer country,
-- production data, certs, etc. before letting someone into the platform — they add all of that
-- as they actually use it: creating offers, bids, requirements). See onboarding_routes.py.
--
-- state/country were previously required at signup; now optional (grower_profiles.state is
-- editable later via /api/grower-profile, international_buyer_profiles.country has no such
-- screen yet but nothing reads it besides the buyer's own profile display, so null is safe).

begin;

alter table public.accounts
  add column if not exists contact_name  text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists ein_last4     text check (ein_last4 is null or ein_last4 ~ '^[0-9]{4}$');

alter table public.grower_profiles
  alter column state drop not null;

alter table public.international_buyer_profiles
  alter column country drop not null;

commit;

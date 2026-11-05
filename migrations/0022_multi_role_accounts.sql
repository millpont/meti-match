-- Multi-role accounts: a company (e.g. a trading house) can hold more than one role at once
-- (a Trader/Service Provider that also runs its own Program Operator grain program, per the
-- client's Cargill/ADM examples). accounts.role stays as the account's PRIMARY/default role
-- (used at first login each session, and by everything that predates this migration); this adds
-- an account_roles join table for the FULL set of roles an account holds. A single-role account
-- just has one row here, mirroring accounts.role exactly — nothing changes for it.
--
-- Adding a role (POST /api/roles) creates the matching profile row (grower_profiles etc.) with
-- minimal defaults, same as onboarding, plus a row here. Switching the ACTIVE role for the
-- current session (POST /api/switch-role) only touches session state, never this table.

begin;

create table if not exists public.account_roles (
  account_id uuid not null references public.accounts(id) on delete cascade,
  role       text not null check (role in (
               'grower', 'program_operator', 'international_buyer', 'service_provider', 'admin'
             )),
  created_at timestamptz not null default now(),
  primary key (account_id, role)
);

insert into public.account_roles (account_id, role)
  select id, role from public.accounts
  on conflict do nothing;

alter table public.account_roles enable row level security;

commit;

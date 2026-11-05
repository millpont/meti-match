-- Role switching (adding/switching among roles an account holds — see
-- migrations/0022_multi_role_accounts.sql) is being restricted to accounts a superadmin
-- explicitly opts in via the Accounts page, rather than being available to everyone by default.
--
-- Accounts that already legitimately hold more than one role (e.g. a Trader running its own
-- Program Operator program) keep working without a superadmin having to notice and flip them on
-- individually first.

begin;

alter table public.accounts
  add column if not exists role_switching_enabled boolean not null default false;

update public.accounts
set role_switching_enabled = true
where id in (
  select account_id from public.account_roles group by account_id having count(*) > 1
);

commit;

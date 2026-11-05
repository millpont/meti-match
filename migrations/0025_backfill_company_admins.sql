-- migrations/0024_company_join_requests.sql added auth0_users.is_company_admin with
-- DEFAULT false, which correctly makes a NEW company's first registrant its admin — but every
-- account that already existed before that migration got is_company_admin=false too, leaving
-- them with no company admin at all.
--
-- Before 0024, auth0_users.account_id was one-to-one with accounts (confirmed: no account had
-- more than one linked login), so the single login already linked to each account IS that
-- company's original registrant — safe to backfill directly.

begin;

update public.auth0_users
set is_company_admin = true
where account_id is not null;

commit;

-- accounts.approval_decided_by_account_id had no ON DELETE behaviour, so once a superadmin had
-- approved anyone, that superadmin's own account could never be deleted (23503) — caught by a
-- pytest teardown failure in tests/test_account_approval.py.
--
-- ON DELETE SET NULL: losing the "who decided it" pointer when that admin's account goes away is
-- fine, and strictly better than either blocking the delete or cascading it (which would delete
-- the approved ACCOUNT along with the admin). approval_status and approval_decided_at — the parts
-- that actually matter — are untouched.
alter table accounts drop constraint if exists accounts_approval_decided_by_account_id_fkey;
alter table accounts
  add constraint accounts_approval_decided_by_account_id_fkey
  foreign key (approval_decided_by_account_id) references accounts(id) on delete set null;

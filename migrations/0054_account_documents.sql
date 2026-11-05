-- "Company Documentation" a superadmin can review when approving an account — Articles of
-- Incorporation, the IRS Confirmation Letter, etc. Optional at registration, and addable later
-- from the Profile page.
--
-- Same labeled-multi-upload shape as offer_documents (migrations/0046) and
-- production_data_documents (migrations/0052), minus the category column: everything here is
-- company documentation, the label is what distinguishes one file from another.
create table if not exists account_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  label text not null,
  file_path text not null,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index if not exists account_documents_account_id_idx on account_documents(account_id);

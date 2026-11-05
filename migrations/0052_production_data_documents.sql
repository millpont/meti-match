-- Production Data's document upload was hard-capped at exactly 2 fixed slots (soil test,
-- verification statement) with no way to label what was actually uploaded -- same gap
-- offer_documents (migrations/0046) fixed for offers. This is the same pattern for Production
-- Data: an open-ended, labeled multi-upload tagged either "Grower Documents" or "Certification
-- Documents", additive alongside the 2 existing fixed fields on production_data (kept as-is, no
-- migration of existing files).
create table if not exists production_data_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  commodity text not null,
  label text not null,
  category text not null check (category in ('grower', 'certification')),
  file_path text not null,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index if not exists production_data_documents_account_commodity_idx
  on production_data_documents(account_id, commodity);

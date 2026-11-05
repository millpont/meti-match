-- Offer document uploads were hard-capped at exactly 2 slots (verification, soil test) with no
-- way to label what was actually uploaded. This adds an open-ended, labeled multi-upload
-- alongside those 2 fixed fields (kept exactly as-is, no migration of existing files) -- see
-- offer_documents_routes.py.
create table if not exists offer_documents (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references offers(id) on delete cascade,
  uploaded_by_account_id uuid not null references accounts(id),
  label text not null,
  category text not null check (category in ('general', 'certification')),
  file_path text not null,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index if not exists offer_documents_offer_id_idx on offer_documents(offer_id);

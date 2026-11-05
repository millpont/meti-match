-- Phase 10 Pass 1 continued: a profile needs more than one photo (a single "avatar" isn't
-- enough once a grower wants to show pictures of the farm itself) — a real table, not another
-- jsonb array on accounts, since photos get added/removed one at a time and each needs a stable
-- id to target for deletion.

begin;

create table if not exists public.account_gallery_photos (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  path       text not null,
  caption    text,
  created_at timestamptz not null default now()
);

create index if not exists idx_account_gallery_photos_account on public.account_gallery_photos (account_id);

alter table public.account_gallery_photos enable row level security;

commit;

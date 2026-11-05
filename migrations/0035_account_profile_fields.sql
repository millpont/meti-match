-- Phase 10 Pass 1: profile system (photo/bio/links/contact-visibility) for all 4 roles.
-- These are account-level, not role-specific — an account has one identity regardless of which
-- role(s) it holds (see account_roles/role-switching) — so they live on accounts itself rather
-- than duplicated across the four per-role profile tables.
--
-- contact_visible defaults false: contact_name/contact_phone/contact_email have never left the
-- account boundary before this (collected at onboarding, read only by admin) — defaulting to
-- hidden preserves today's behavior for every existing account until they explicitly opt in.

begin;

alter table public.accounts
  add column if not exists photo_path text,
  add column if not exists bio text,
  add column if not exists website_url text,
  add column if not exists links jsonb not null default '[]',
  add column if not exists contact_visible boolean not null default false;

commit;

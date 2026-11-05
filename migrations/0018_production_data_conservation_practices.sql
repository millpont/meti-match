-- Conservation practices move from the (now-removed) Basic Production Data section — a single
-- farm-wide list on grower_profiles — to a per-commodity default on production_data, matching
-- every other practice/trait already tracked there (irrigation, rotation, verification, etc.).
-- grower_profiles.conservation_practices is left in place (unused going forward, not dropped —
-- no destructive migration for a column with no remaining reader).

begin;

alter table public.production_data
  add column if not exists conservation_practices text[] not null default '{}';

commit;

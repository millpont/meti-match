-- production_data was keyed by (account_id, commodity) only -- one set of defaults per
-- commodity, used for every listing of that commodity regardless of marketing year. This adds a
-- marketing_year dimension so a grower can keep a separate set of defaults per year, while
-- keeping a single fallback default that still applies when no year-specific row exists.
--
-- A NULL marketing_year can't be part of a primary key (Postgres doesn't allow NULLs in PK
-- columns), so 'any' is used as an explicit sentinel for "applies to any year" instead of NULL --
-- every existing row becomes that fallback row via the column default below, so nothing already
-- saved is lost or reinterpreted.
alter table production_data add column if not exists marketing_year text not null default 'any';
alter table production_data drop constraint if exists production_data_pkey;
alter table production_data add primary key (account_id, commodity, marketing_year);

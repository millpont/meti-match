-- New grain-characteristic fields on offers (item 97/99/100): Test Weight + BCFM apply to any
-- commodity; Seed Variety (GM/Non-GM) applies to any commodity; Tannin Level Max, Non-Tannin/White
-- Sorghum, and BNFM are Sorghum-specific but stored the same nullable way as every other optional
-- offer field (unused/null for other commodities, same convention as protein_pct/moisture_pct_max).
alter table offers add column if not exists test_weight numeric;
alter table offers add column if not exists bcfm_pct numeric default 3;
alter table offers add column if not exists seed_variety text check (seed_variety in ('GM', 'Non-GM'));
alter table offers add column if not exists tannin_level_max numeric;
alter table offers add column if not exists non_tannin_sorghum boolean default false;
alter table offers add column if not exists bnfm_pct numeric;

-- The USDA FD-CIC advanced fields (migrations/0048) were never actually surfaced to buyers --
-- resolve_production() only merges the "core" fields into what a listing shows. This adds an
-- explicit per-row opt-in: a grower can fill these fields out privately and only choose to show
-- them on their listings once they're ready to.
alter table production_data add column if not exists show_advanced_in_listing boolean not null default false;

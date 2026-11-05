-- One migration covering a batch of feature requests:
--   - yield units (production_data + offers' override)
--   - third-party verification document attachment (production_data + offers' override)
--   - account freeze (superadmin suspension)
--   - GAFTA/FOSFA-informed dispute categorization, resolution track, and two-tier appeal

begin;

-- ---------------------------------------------------------------- yield units + verification doc

alter table public.production_data
  add column if not exists yield_unit text check (yield_unit in ('bu/acre', 'MT/acre')),
  add column if not exists verification_document_path text;

alter table public.offers
  add column if not exists override_yield_unit text check (override_yield_unit in ('bu/acre', 'MT/acre')),
  add column if not exists override_verification_document_path text;

-- ---------------------------------------------------------------- account freeze

alter table public.accounts
  add column if not exists frozen boolean not null default false,
  add column if not exists frozen_reason text;

-- ---------------------------------------------------------------- disputes: GAFTA/FOSFA model
--
-- Real GAFTA/FOSFA arbitration involves a two-tier process (tribunal, then a Board of Appeal
-- re-hearing on the merits), a documents-only default, English law, and strict filing deadlines
-- (commonly ~90 days from the delivery/completion date, contract-specific in reality). Quality/
-- condition disputes are usually resolved via expert determination instead of full arbitration.
-- This app can't replace real arbitral institutions, but the categorization, track, and appeal
-- tier are modeled so the workflow matches how these disputes are actually structured.

alter table public.disputes
  add column if not exists category text not null default 'other'
    check (category in ('non_performance', 'quality_condition', 'force_majeure', 'demurrage_laytime', 'price_damages', 'other')),
  add column if not exists resolution_track text not null default 'arbitration'
    check (resolution_track in ('arbitration', 'expert_determination')),
  add column if not exists tier text not null default 'tribunal'
    check (tier in ('tribunal', 'board_of_appeal')),
  add column if not exists filing_deadline date,
  add column if not exists is_time_barred boolean not null default false,
  add column if not exists tribunal_resolution_notes text,
  add column if not exists appealed_at timestamptz;

commit;

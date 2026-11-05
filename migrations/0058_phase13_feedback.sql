-- Phase 13 (client feedback round): business verification moved out of signup, operator-created
-- and invited growers, aggregated operator listings, crop-rotation split, enrollment
-- notifications.

begin;

-- 1. Crop rotation is now "N crops over M years" — crop_rotation_years keeps meaning years; this
--    adds the crop count beside it, on the commodity default and on the per-offer override.
alter table public.production_data add column if not exists crop_rotation_crops numeric;
alter table public.offers add column if not exists override_crop_rotation_crops numeric;

-- 2. Business verification. The EIN-last-4 + documents step left signup (it was turning people
--    away before they'd seen the platform); instead an account must have ONE role-appropriate
--    business identifier plus at least one account_documents row before it can transact (publish
--    a listing, respond to one). See backend/business_verification.py. ein_last4 stays for the
--    accounts that already supplied it but is no longer collected.
alter table public.accounts add column if not exists business_id_type text check (
  business_id_type is null or business_id_type in (
    'ein', 'state_registration', 'parent_state_registration', 'foreign_registration'
  )
);
alter table public.accounts add column if not exists business_id_value text;

-- 3. A grower account a program operator registered on the grower's behalf, before the grower
--    themselves has ever logged in. Unclaimed while no auth0_users row points at it; the grower
--    claims it by logging in with the same (verified) email — see onboarding_routes.py.
alter table public.accounts add column if not exists created_by_operator_account_id uuid
  references public.accounts(id) on delete set null;

-- 4. Growers opt in to being discoverable by program operators looking for growers to invite.
alter table public.grower_profiles add column if not exists open_to_program_enrollment boolean not null default false;

-- 5. Operator-initiated invitations to an already-registered grower: 'invited' until the grower
--    accepts (-> active) or declines (row removed). 'pending' keeps meaning grower-initiated.
alter table public.program_enrollments drop constraint if exists program_enrollments_status_check;
alter table public.program_enrollments add constraint program_enrollments_status_check
  check (status in ('active', 'pending', 'invited'));

-- 6. Aggregated operator listings: one offer, created by the operator under their own name,
--    pooling volume from several actively-enrolled growers (plus optionally the operator's own).
create table if not exists public.offer_aggregate_growers (
  offer_id           uuid not null references public.offers(id) on delete cascade,
  grower_account_id  uuid not null references public.accounts(id) on delete cascade,
  contributed_volume numeric,
  contributed_acres  numeric,
  created_at         timestamptz not null default now(),
  primary key (offer_id, grower_account_id)
);
create index if not exists idx_offer_aggregate_growers_grower on public.offer_aggregate_growers (grower_account_id);
alter table public.offer_aggregate_growers enable row level security;

-- 7. Enrollment-flow notifications (none existed — a grower's join request reached the operator
--    silently).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'response_received', 'status_changed', 'message_received', 'dispute_raised', 'dispute_resolved',
  'offer_approval_requested', 'offer_approved', 'offer_declined',
  'bid_approval_requested', 'bid_approved', 'bid_declined',
  'representation_requested', 'representation_approved', 'representation_declined',
  'join_request_received', 'join_request_approved',
  'attribute_request_received',
  'service_request_requested', 'service_request_accepted', 'service_request_declined',
  'account_approved', 'account_declined',
  'enrollment_requested', 'enrollment_approved', 'enrollment_invited', 'enrollment_accepted',
  'enrollment_declined', 'aggregate_listing_included'
));

commit;

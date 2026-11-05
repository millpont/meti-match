-- Enables RLS on every table added since the Phase 0 identity schema (accounts, grower_profiles,
-- etc. already have it enabled). No policies needed: the backend talks to Supabase exclusively
-- through the service_role key (see backend/sb.py), which bypasses RLS regardless of policies —
-- this only matters for blocking direct anon/authenticated access, which the frontend never uses
-- anyway (it only ever calls the Flask API, never Supabase directly).

begin;

alter table public.offers enable row level security;
alter table public.bids enable row level security;
alter table public.listing_responses enable row level security;
alter table public.listing_response_messages enable row level security;
alter table public.buyer_requirements enable row level security;
alter table public.contracts enable row level security;
alter table public.production_data enable row level security;
alter table public.disputes enable row level security;

commit;

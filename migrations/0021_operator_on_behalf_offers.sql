-- A program operator can create an offer "on behalf of" one of their actively-enrolled growers
-- (not just their own grain) — but it can't go live until that grower approves it, and the
-- acres offered this way are capped by that grower's own acres_enrolled (see
-- enrollments_routes.py's remaining_enrolled_acres, called from offers_routes.py's create_offer).
--
-- grower_approval_status defaults to 'not_required' for the ordinary case (a grower's own offer,
-- or an operator's own grain) — only offers with on_behalf_of_grower_account_id set go through
-- 'pending' -> 'approved'/'declined'.

begin;

alter table public.offers
  add column if not exists on_behalf_of_grower_account_id uuid references public.accounts(id),
  add column if not exists grower_approval_status text not null default 'not_required'
    check (grower_approval_status in ('not_required', 'pending', 'approved', 'declined'));

create index if not exists idx_offers_on_behalf_of on public.offers (on_behalf_of_grower_account_id);

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'response_received', 'status_changed', 'message_received', 'dispute_raised', 'dispute_resolved',
  'offer_approval_requested', 'offer_approved', 'offer_declined'
));

commit;

-- "Don't see an attribute you need?" — lets any user propose a new attribute/practice/
-- certification/data-requirement term from wherever they're picking one, rather than being
-- stuck with the fixed vocabulary. A superadmin reviews the request and either adds it to the
-- real taxonomy or dismisses it. `type` here is free text (not constrained to
-- taxonomy_terms.VALID_TYPES) since the requester is describing what THEY think it is, not
-- necessarily using our vocabulary correctly.
--
-- Also adds "data_requirement" as a 4th taxonomy family (e.g. "John Deere User ID", "GeoJSON
-- format" — a buyer's specific data ask, distinct from a sustainability/quality attribute).

begin;

create table if not exists public.attribute_requests (
  id                     uuid primary key default gen_random_uuid(),
  requested_by_account_id uuid not null references public.accounts(id) on delete cascade,
  type                   text not null,
  name                   text not null,
  description            text,
  status                 text not null default 'pending' check (status in ('pending', 'added', 'dismissed')),
  created_at             timestamptz not null default now()
);

create index if not exists idx_attribute_requests_pending on public.attribute_requests (created_at desc) where status = 'pending';

alter table public.attribute_requests enable row level security;

alter table public.taxonomy_terms drop constraint taxonomy_terms_type_check;
alter table public.taxonomy_terms add constraint taxonomy_terms_type_check
  check (type in ('attribute', 'practice', 'certification', 'data_requirement'));

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'response_received', 'status_changed', 'message_received', 'dispute_raised', 'dispute_resolved',
  'offer_approval_requested', 'offer_approved', 'offer_declined',
  'bid_approval_requested', 'bid_approved', 'bid_declined',
  'representation_requested', 'representation_approved', 'representation_declined',
  'join_request_received', 'join_request_approved',
  'attribute_request_received'
));

commit;

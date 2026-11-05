-- Widen notifications.type for the service-request lifecycle (Phase 10 Pass 2), same
-- drop/re-add pattern every prior widening of this constraint has used (0021, 0023, 0024, 0027).

begin;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'response_received', 'status_changed', 'message_received', 'dispute_raised', 'dispute_resolved',
  'offer_approval_requested', 'offer_approved', 'offer_declined',
  'bid_approval_requested', 'bid_approved', 'bid_declined',
  'representation_requested', 'representation_approved', 'representation_declined',
  'join_request_received', 'join_request_approved',
  'attribute_request_received',
  'service_request_requested', 'service_request_accepted', 'service_request_declined'
));

commit;

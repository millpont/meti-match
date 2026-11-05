-- RFQ (bid) drafts: a buyer can save an RFQ before business verification (or just before it's
-- ready) and publish it later — same draft -> live flow offers already have. 'draft' bids are
-- excluded everywhere 'open' is required (browse, matching, responding, Directory counts).

begin;

alter table public.bids drop constraint if exists bids_status_check;
alter table public.bids add constraint bids_status_check check (status in ('draft', 'open', 'closed'));

commit;

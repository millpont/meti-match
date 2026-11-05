-- Service Providers are technical-services providers by default; only those who opt in as a
-- Trader (contracting on behalf of represented international buyers) get bids, listings,
-- Responses, Agreements and contract stats. Backfills existing traders — any SP that already
-- has a buyer representation or created a bid — so nobody loses access they were using.

begin;

alter table public.service_provider_profiles
  add column if not exists is_trader boolean not null default false;

update public.service_provider_profiles sp
   set is_trader = true
 where exists (select 1 from public.buyer_representations r where r.service_provider_account_id = sp.account_id)
    or exists (select 1 from public.bids b where b.created_by = sp.account_id);

commit;

notify pgrst, 'reload schema';

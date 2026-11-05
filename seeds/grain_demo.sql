-- METI Match — demo seed for Phase 2 manual testing.
--
-- Seeds one demo buyer account (with a profile) and a few open bids, so a
-- grower's "Browse Bids" screen has real data before Phase 3 builds the buyer-facing UI.
-- Idempotent: matches on accounts.name, so re-running replaces the demo buyer's bids rather
-- than duplicating them.
--
-- Remove anytime with:
--   delete from public.bids where created_by = (select id from public.accounts where name = 'Demo Global Grain Traders');
--   delete from public.international_buyer_profiles where account_id = (select id from public.accounts where name = 'Demo Global Grain Traders');
--   delete from public.accounts where name = 'Demo Global Grain Traders';

begin;

do $$
declare
  v_account_id uuid;
begin
  select id into v_account_id from public.accounts where name = 'Demo Global Grain Traders';

  if v_account_id is null then
    insert into public.accounts (role, name)
    values ('international_buyer', 'Demo Global Grain Traders')
    returning id into v_account_id;

    insert into public.international_buyer_profiles
      (account_id, company_name, country, sector, annual_purchase_volume_mt,
       commodities_of_interest, required_attributes, destination_ports)
    values
      (v_account_id, 'Demo Global Grain Traders', 'Japan', 'Feed', 50000,
       '{Corn,Sorghum}', '{Non-GMO,Sustainable}', '{Yokohama}');
  end if;

  delete from public.bids where created_by = v_account_id;

  insert into public.bids
    (created_by, commodity, variety, bid_type, quantity, bid_price_usd_per_mt,
     delivery_window_start, delivery_window_end, required_attributes, destination_country, status)
  values
    (v_account_id, 'Corn', 'Yellow Dent #2', 'available_grain', 25000, 245.00,
     '2026-07-15', '2026-08-31', '{Non-GMO,Low-CI,Sustainable}', 'Japan', 'open'),
    (v_account_id, 'Sorghum', 'White Food-Grade', 'volumes_for_contracting', 50000, 238.00,
     '2026-09-01', '2026-10-15', '{Non-GMO,Sustainable}', 'Japan', 'open'),
    (v_account_id, 'Corn', 'Food-Grade / IP Corn', 'acres_for_contracting', 1000, 238.00,
     '2027-03-01', '2027-04-30', '{Non-GMO,Sustainable}', 'Japan', 'open');
end $$;

commit;

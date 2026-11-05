-- Offers only had a single "Expected Date of Delivery" plus a separate Harvest Start/End pair --
-- bids already have a proper delivery_window_start/end pair (see migrations/0005). This gives
-- offers the same two-date delivery window instead of pinning delivery to harvest timing.
--
-- expected_delivery_date is NOT dropped -- real growers may already have one set, and losing it
-- silently would be a real data loss on a live system. It's backfilled into a one-day window
-- (start = end = the old single date) so nothing already on file is lost, then the application
-- stops reading/writing it going forward in favor of the new pair.
alter table offers add column if not exists delivery_window_start date;
alter table offers add column if not exists delivery_window_end date;

update offers
set delivery_window_start = expected_delivery_date,
    delivery_window_end = expected_delivery_date
where expected_delivery_date is not null
  and delivery_window_start is null
  and delivery_window_end is null;

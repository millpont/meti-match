-- Per-negotiation chat for Open Match.
--
-- A negotiation thread is keyed by (deal_id, party_account_id), where party_account_id is the
-- interested party (the account that expressed interest). The two participants in a thread are
-- that party and the deal's creator. Messaging is only surfaced by the app while the party's
-- status in open_match.match_statuses is 'in-negotiation', but the table itself keeps the full
-- history so a consummated ('deal-made') deal retains its record.
--
-- References the SHARED accounts table, like open_match. Cascades on deal delete so an admin
-- takedown removes the thread too.

begin;

create table if not exists public.open_match_messages (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid not null references public.open_match(id) on delete cascade,
  party_account_id  uuid not null references public.accounts(id),   -- interested party = thread key
  sender_account_id uuid not null references public.accounts(id),   -- creator or the party
  body              text not null check (length(btrim(body)) > 0),
  created_at        timestamptz not null default now()
);

-- Fetch a thread in chronological order.
create index if not exists open_match_messages_thread_idx
  on public.open_match_messages (deal_id, party_account_id, created_at);

commit;

-- In-app notification center. Real (OS/browser) push is a separate, larger lift (service worker,
-- VAPID keys, a permission prompt) — this is the in-app foundation: a bell icon with an unread
-- count and a dropdown, polled periodically. See notifications_routes.py for the trigger points
-- (a response on your listing, a status change, a new negotiation message, a dispute raised or
-- resolved).

begin;

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  type       text not null check (type in (
               'response_received', 'status_changed', 'message_received',
               'dispute_raised', 'dispute_resolved'
             )),
  title      text not null,
  body       text,
  -- Optional pointer to what this is about (a response or a dispute) — not a foreign key since
  -- it can point at either table; the frontend doesn't deep-link yet, this is for later use.
  link_type  text,
  link_id    uuid,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_account_created
  on public.notifications (account_id, created_at desc);

alter table public.notifications enable row level security;

commit;

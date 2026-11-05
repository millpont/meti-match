-- Service requests had no follow-up communication channel once accepted -- "nothing happens
-- after." This mirrors listing_response_messages (migrations/0006) for service_requests.
create table if not exists service_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references service_requests(id) on delete cascade,
  sender_account_id uuid not null references accounts(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists service_request_messages_request_id_idx on service_request_messages(request_id, created_at);

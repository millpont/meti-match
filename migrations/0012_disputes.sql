-- METI Match — Phase 7: disputes. Resolves the "scope dispute fields/workflow" open
-- question from plans/meti-match/03-api-plan.md: a dispute is raised by either party
-- against a specific contract (the concrete transactional unit), and resolved by an admin.
-- Minimal by design — no dispute categories/evidence/messaging beyond a reason + description,
-- matching how little the mockup specifies beyond the "Disputes" nav item.

begin;

create table if not exists public.disputes (
  id                  uuid primary key default gen_random_uuid(),
  contract_id         uuid not null references public.contracts(id) on delete cascade,
  raised_by_account_id uuid not null references public.accounts(id),
  reason              text not null,
  description         text,
  status              text not null default 'open' check (status in ('open', 'resolved')),
  resolution_notes    text,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);

create index if not exists idx_disputes_contract on public.disputes (contract_id);
create index if not exists idx_disputes_status on public.disputes (status, created_at desc);

commit;

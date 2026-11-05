-- Optional contact email on an enrollment — not in the original mockup, but the natural key for
-- a future invite-to-platform flow (auto-linking grower_account_id once they self-register).

begin;

alter table public.program_enrollments
  add column if not exists grower_email text;

commit;

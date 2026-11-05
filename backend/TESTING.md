# Backend tests

Integration tests against the real app — real Flask routing, the real `@requires_auth` decorator,
real database round trips. There is no mocked database.

## ⚠️ Point this at a TEST Supabase project, never production

Tests create and delete real rows (disposable, uniquely-named accounts only — see
`conftest.py`'s `make_account` fixture), but a crashed or interrupted run can leave orphans
behind, and no automated run should have routine write access to production data.

- Locally: point your `backend/.env` (or shell env) at a separate Supabase project before
  running the suite — do not run it against the project your dev server usually talks to if
  that's production.
- In CI: the `TEST_SUPABASE_URL` / `TEST_SUPABASE_SERVICE_KEY` GitHub Actions secrets referenced
  by `.github/workflows/backend-tests.yml` must point at that dedicated test project. The
  workflow does not set any `AUTH0_*` secrets — `init_auth()` only registers OAuth config
  synchronously at startup (no network call), and none of these tests exercise the real
  `/login`/`/callback` routes, so dummy/unset Auth0 config is fine in CI.
- The test project needs the same schema as production — run every migration in `migrations/`
  against it once before pointing tests at it, and again whenever a new migration is added.

## Running locally

```bash
cd backend
source ../venv/bin/activate   # or your own venv
pip install -r requirements-dev.txt
pytest -v
```

## How these tests work

Every test goes through Flask's real `test_client()`, not a bypassed view function call.
`session_transaction()` fakes a login by writing directly into the Flask session (the
equivalent of a real Auth0 callback having already resolved the browser to an account) — see
`login_as()` in `conftest.py`. CSRF is disabled on the test app instance only. Everything else —
URL routing, `@requires_auth`, the account-freeze check, Supabase writes/reads — runs for real.

## Adding a new test

- Get disposable accounts from the `make_account("grower" | "program_operator" |
  "international_buyer" | "service_provider")` fixture — it onboards a real, uniquely-tokened
  account through the real onboarding endpoint and tears it down afterward. **Never use a real,
  named, pre-existing account for a test** — there is no snapshot/rollback here, only explicit
  cleanup, and mistakes have previously leaked into real account data during manual testing.
- Use `login_as(client, account_id=..., role=...)` to switch which party the client is acting as
  mid-test (e.g. respond to an offer as the buyer, then switch back to the grower to accept it).
- If your test creates rows in a table that isn't already covered by `make_account`'s teardown
  passes, clean them up explicitly in the test itself (or extend the fixture) — check whether the
  table cascade-deletes from `accounts.id` before assuming teardown is automatic.

"""Environment-driven configuration. Mirrors METI's env contract so the same secrets work."""
import os
from dotenv import load_dotenv

# Load .env from repo root (one level up from backend/).
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))


class Config:
    # Flask
    SECRET_KEY = os.environ.get("APP_SECRET_KEY", "dev-only-change-me")
    ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = ENVIRONMENT != "development"
    SESSION_COOKIE_SAMESITE = "Lax"

    # When hosted under a subpath on a shared domain (lab.millpont.com/match), scope the cookie
    # to that path and give it a distinct name so it can never collide with the lab app's cookie.
    APP_BASE = os.environ.get("APP_BASE", "/")
    SESSION_COOKIE_NAME = "openmatch_session"
    SESSION_COOKIE_PATH = APP_BASE.rstrip("/") or "/"

    # Auth0 (same tenant/app registration reused for the METI Match rebuild)
    AUTH0_CLIENT_ID = os.environ.get("AUTH0_CLIENT_ID")
    AUTH0_CLIENT_SECRET = os.environ.get("AUTH0_CLIENT_SECRET")
    AUTH0_DOMAIN = os.environ.get("AUTH0_DOMAIN")
    AUTH0_CALLBACK_URL = os.environ.get("AUTH0_CALLBACK_URL")

    # Database — for the METI Match rebuild these point at a NEW, standalone Supabase
    # project (see plans/meti-match/01-architecture.md), not METI's original instance
    # that 0001-0003's `open_match` table lives in.
    DB_NAME = os.environ.get("DB_NAME")
    DB_USER = os.environ.get("DB_USER")
    DB_PASSWORD = os.environ.get("DB_PASSWORD")
    DB_HOST = os.environ.get("DB_HOST")
    DB_PORT = os.environ.get("DB_PORT")

    # Supabase REST (PostgREST) — used INSTEAD of direct Postgres, because the host's IP is not
    # on the DB's allow-list but the REST endpoint is reachable (same bypass the METI lab uses).
    SUPABASE_URL = os.environ.get("SUPABASE_URL")
    SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

    # The marketplace table this app owns.
    MATCH_TABLE = os.environ.get("MATCH_TABLE", "open_match")

    # Bootstrap-only admin override: lets the very first admin act before any `accounts.role =
    # 'admin'` row exists (no self-service admin wizard — see plans/meti-match). Normal
    # admin checks go through the account's role instead (see auth.is_superadmin). No default —
    # the old hardcoded MillPont UUID belonged to METI's original project and has no meaning here.
    SUPERADMIN_ACCOUNT_ID = os.environ.get("SUPERADMIN_ACCOUNT_ID")

    # Whether a brand-new account (a new email registering a NEW company) has to be approved by a
    # superadmin before it can use the app. OFF by default and deliberately so: the approval
    # machinery is fully built (accounts.approval_status, the pending screen, the superadmin
    # Approve/Decline action) but stays dormant until this is set, so first-round testing users
    # aren't blocked at signup. Set ACCOUNT_APPROVAL_REQUIRED=true in .env to turn it on.
    #
    # This never applies to someone JOINING an existing company — that already goes through that
    # company's own admin (account_join_requests, see company_routes.py).
    ACCOUNT_APPROVAL_REQUIRED = os.environ.get("ACCOUNT_APPROVAL_REQUIRED", "").strip().lower() in ("1", "true", "yes")

    # Business verification (business_verification.py): an account must add a role-appropriate
    # business identifier + at least one company document before it can publish or respond to a
    # listing. ON by default — this is the client's requested behavior. Set
    # BUSINESS_VERIFICATION_REQUIRED=false to let unverified accounts transact (e.g. a demo).
    BUSINESS_VERIFICATION_REQUIRED = os.environ.get("BUSINESS_VERIFICATION_REQUIRED", "true").strip().lower() not in ("0", "false", "no")


config = Config()

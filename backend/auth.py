"""Auth0 login via Authlib — the same tenant and the same auth0_users table METI uses.

A logged-in user is mapped to a custodian account through auth0_users.account_id. New users are
created with a NULL account_id; an admin links them to an account in the DB (same as METI).
"""
import logging
from functools import wraps

from flask import Blueprint, session, redirect, request, jsonify, current_app
from authlib.integrations.flask_client import OAuth

import sb
from config import config
from db import (
    account_freeze_state, account_id_for_auth0, account_name_for_id, account_role_for_id,
    account_roles_for_id, approval_state, display_name_for_id, is_company_admin_for_auth0,
    pending_join_request_for_auth0, role_switching_enabled_for_id,
    claimable_account_for_email,
)

logger = logging.getLogger(__name__)

oauth = OAuth()
auth_bp = Blueprint("auth", __name__)


def init_auth(app):
    oauth.init_app(app)
    oauth.register(
        "auth0",
        client_id=config.AUTH0_CLIENT_ID,
        client_secret=config.AUTH0_CLIENT_SECRET,
        api_base_url=f"https://{config.AUTH0_DOMAIN}",
        access_token_url=f"https://{config.AUTH0_DOMAIN}/oauth/token",
        authorize_url=f"https://{config.AUTH0_DOMAIN}/authorize",
        jwks_uri=f"https://{config.AUTH0_DOMAIN}/.well-known/jwks.json",
        server_metadata_url=f"https://{config.AUTH0_DOMAIN}/.well-known/openid-configuration",
        client_kwargs={"scope": "openid profile email"},
    )


# Endpoints an account still awaiting superadmin approval may reach anyway: it needs to be able to
# attach the company documentation that gets it approved (the pending screen offers that upload),
# and /api/me isn't decorated with requires_auth at all so the SPA can always read its own status.
PENDING_APPROVAL_ALLOWED_PREFIXES = ("/api/account/documents",)


def requires_auth(f):
    """Gate an API route on a logged-in session. Returns 401 JSON (the SPA redirects to /login).

    Also blocks a frozen account from every API call, not just the frontend's suspension screen
    — a freeze that only a client-side gate enforces isn't really enforced. Freeze state is
    cached on the session at login (see callback), so an admin freezing someone mid-session
    takes effect on their next login, not instantly — that's the intended scope.

    Same treatment for an account still awaiting superadmin approval, with one difference: that
    flag is refreshed on every /api/me poll (not just at login), so an approval lands for a
    waiting user without them having to log back in. Inert unless
    config.ACCOUNT_APPROVAL_REQUIRED is on — nothing ever sets session["approval_pending"]
    otherwise (see /api/me below and onboarding_routes.py's _create_account_and_link)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if "profile" not in session:
            return jsonify({"error": "authentication required"}), 401
        if session.get("frozen"):
            return jsonify({"error": "account suspended", "frozen": True}), 403
        if session.get("approval_pending") and not request.path.startswith(PENDING_APPROVAL_ALLOWED_PREFIXES):
            return jsonify({"error": "account pending approval", "pending_approval": True}), 403
        return f(*args, **kwargs)
    return decorated


def current_account_id():
    return session.get("account_id")


def is_superadmin():
    # Admin is normally a real account role (self-service onboarding has no admin wizard, so an
    # operator promotes an account to 'admin' directly in the DB). SUPERADMIN_ACCOUNT_ID remains
    # as a bootstrap fallback so the very first admin doesn't need a DB edit before they can act.
    if session.get("role") == "admin":
        return True
    account_id = session.get("account_id")
    return bool(account_id) and str(account_id) == str(config.SUPERADMIN_ACCOUNT_ID)


@auth_bp.route("/login")
def login():
    if request.args.get("clear_session") == "1":
        session.clear()
    return oauth.auth0.authorize_redirect(
        redirect_uri=config.AUTH0_CALLBACK_URL,
        response_type="code",
        response_mode="query",
        prompt="login",
    )


@auth_bp.route("/callback")
def callback():
    try:
        oauth.auth0.authorize_access_token()
        userinfo = oauth.auth0.get("userinfo").json()

        session["profile"] = {
            "user_id": userinfo["sub"],
            "name": userinfo.get("name", ""),
            "picture": userinfo.get("picture", ""),
            "email": userinfo.get("email", ""),
            # Needed to let someone claim a grower account their program operator registered for
            # them by email (onboarding_routes.py's claim endpoint) — an unverified address
            # would let anyone sign up as that email and take the account over.
            "email_verified": bool(userinfo.get("email_verified")),
        }

        # Resolve the account from the DB. A DB outage here must NOT bounce the user out of the
        # app or masquerade as "no account" — flag it so the SPA can say what's actually wrong.
        try:
            _ensure_auth0_user(userinfo)
            session["account_id"] = account_id_for_auth0(userinfo["sub"])
            session["account_name"] = account_name_for_id(session["account_id"])
            # "role" is the ACTIVE role for this session (what dashboard renders); "roles" is the
            # full set the account holds (see migrations/0022_multi_role_accounts.sql). Login
            # always starts on the account's primary role — switching is a per-session choice
            # (POST /api/switch-role), never persisted.
            session["role"] = account_role_for_id(session["account_id"])
            session["roles"] = account_roles_for_id(session["account_id"])
            session["frozen"], session["frozen_reason"] = account_freeze_state(session["account_id"])
            # Same treatment as frozen: seeded at login so the gate is live from the first
            # request, then refreshed on every /api/me poll so an approval lands without a
            # re-login. Always False while ACCOUNT_APPROVAL_REQUIRED is off.
            session["approval_pending"] = (
                config.ACCOUNT_APPROVAL_REQUIRED
                and approval_state(session["account_id"])[0] == "pending"
            )
            session.pop("db_unavailable", None)
        except Exception as db_e:
            logger.error("callback DB step failed: %s", db_e)
            session["account_id"] = None
            session["account_name"] = None
            session["role"] = None
            session["roles"] = []
            session["frozen"] = False
            session["frozen_reason"] = None
            session["db_unavailable"] = True

        # Always land back on the SPA (under APP_BASE), never the co-hosted app at the domain root.
        return redirect(session.pop("next_url", None) or config.APP_BASE)
    except Exception as e:
        # Auth0/token/state errors only (DB errors are handled above).
        logger.error("callback failed: %s", str(e))
        session.clear()
        return redirect(config.APP_BASE)


@auth_bp.route("/logout")
def logout():
    # Local logout only (matches METI; does not federate-logout of Google).
    session.clear()
    return redirect(config.APP_BASE)


@auth_bp.route("/api/me")
def me():
    if "profile" not in session:
        return jsonify({"authenticated": False}), 200
    account_id = session.get("account_id")
    # Resolve the account's display name/role. Cached on the session so /api/me stays a cheap
    # call and a transient DB hiccup here doesn't blank out the header on every poll.
    account_name = session.get("account_name")
    role = session.get("role")
    roles = session.get("roles")
    pending_join_request = None

    if not account_id:
        # Not linked to an account yet — check whether a company admin (or superadmin) has since
        # approved a join request for this login, so a poll here reflects it without a re-login.
        try:
            resolved = account_id_for_auth0(session["profile"]["user_id"])
        except Exception as e:
            logger.error("account re-resolution failed: %s", e)
            resolved = None
        if resolved:
            account_id = resolved
            session["account_id"] = account_id
            account_name = account_name_for_id(account_id)
            role = account_role_for_id(account_id)
            roles = account_roles_for_id(account_id)
            session["account_name"] = account_name
            session["role"] = role
            session["roles"] = roles
            session["frozen"], session["frozen_reason"] = account_freeze_state(account_id)
        else:
            try:
                pending_join_request = pending_join_request_for_auth0(session["profile"]["user_id"])
            except Exception as e:
                logger.error("pending join request lookup failed: %s", e)

    if account_id and account_name is None:
        try:
            account_name = account_name_for_id(account_id)
            session["account_name"] = account_name
        except Exception as e:
            logger.error("account name lookup failed: %s", e)
    if account_id and role is None:
        try:
            role = account_role_for_id(account_id)
            session["role"] = role
        except Exception as e:
            logger.error("account role lookup failed: %s", e)
    if account_id and roles is None:
        try:
            roles = account_roles_for_id(account_id)
            session["roles"] = roles
        except Exception as e:
            logger.error("account roles lookup failed: %s", e)
    # Re-checked every call, not cached on the session — this can flip (a backfill, or a
    # superadmin/admin promoting someone) without the user logging back in, and it's one
    # cheap indexed lookup, same cost class as the checks above.
    is_company_admin = False
    role_switching_enabled = False
    if account_id:
        try:
            is_company_admin = is_company_admin_for_auth0(session["profile"]["user_id"])
        except Exception as e:
            logger.error("company admin lookup failed: %s", e)
        try:
            role_switching_enabled = role_switching_enabled_for_id(account_id)
        except Exception as e:
            logger.error("role switching lookup failed: %s", e)
    # Not session-cached (unlike account_name/role above) — a profile edit should be reflected in
    # the header on the very next poll, not only after the next login.
    display_name = None
    if account_id:
        try:
            display_name = display_name_for_id(account_id)
        except Exception as e:
            logger.error("display name lookup failed: %s", e)
    # Also re-read every call, and cached back onto the session so requires_auth's gate sees it —
    # that's what lets a superadmin's approval reach a waiting user on their next poll instead of
    # only after they log back in (the SPA polls /api/me while showing the pending screen).
    approval_status, approval_note = "approved", None
    if account_id:
        try:
            approval_status, approval_note = approval_state(account_id)
        except Exception as e:
            logger.error("approval status lookup failed: %s", e)
    session["approval_pending"] = config.ACCOUNT_APPROVAL_REQUIRED and approval_status == "pending"
    # Lets the SPA prompt for business verification up front (before someone fills in a whole
    # listing) rather than only after the server refuses to publish it. Imported here, not at
    # module top, because business_verification imports this module.
    business_verified = True
    claimable_account = None
    is_trader = None
    if account_id and role == "service_provider":
        try:
            from representations_routes import is_trader as _is_trader
            is_trader = _is_trader(account_id)
        except Exception as e:
            logger.error("trader lookup failed: %s", e)
    if account_id and role:
        try:
            import business_verification
            business_verified = business_verification.is_verified(account_id, role)
        except Exception as e:
            logger.error("business verification lookup failed: %s", e)
    elif not account_id:
        try:
            claimable_account = claimable_account_for_email(session["profile"])
        except Exception as e:
            logger.error("claimable account lookup failed: %s", e)
    return jsonify({
        "authenticated": True,
        "profile": session["profile"],
        "account_id": account_id,
        "account_name": account_name,
        "display_name": display_name,
        "role": role,
        "is_trader": is_trader,
        "roles": roles or ([] if role is None else [role]),
        "is_superadmin": is_superadmin(),
        "is_company_admin": is_company_admin,
        "role_switching_enabled": role_switching_enabled,
        "pending_join_request": pending_join_request,
        "frozen": bool(session.get("frozen")),
        "frozen_reason": session.get("frozen_reason"),
        # Dormant unless ACCOUNT_APPROVAL_REQUIRED is on — see config.py. The SPA uses
        # account_approval_required to decide whether to show any approval UI at all.
        "account_approval_required": config.ACCOUNT_APPROVAL_REQUIRED,
        "approval_status": approval_status,
        "approval_note": approval_note,
        "db_unavailable": bool(session.get("db_unavailable")),
        "business_verification_required": config.BUSINESS_VERIFICATION_REQUIRED,
        "business_verified": business_verified,
        "claimable_account": claimable_account,
    })


def _ensure_auth0_user(userinfo):
    """Create an auth0_users row for a first-time user (account_id NULL until the self-service
    onboarding wizard creates their account — see onboarding_routes.py). Only inserts when
    absent — never overwrites an existing row's account link."""
    sub = userinfo["sub"]
    existing = sb.select("auth0_users", {"auth0_id": f"eq.{sub}", "select": "auth0_id", "limit": 1})
    if existing:
        return
    full_name = userinfo.get("name", "") or ""
    first, _, last = full_name.partition(" ")
    sb.insert(
        "auth0_users",
        {"auth0_id": sub, "email": userinfo.get("email", ""),
         "first_name": first, "last_name": last},
        return_representation=False,
    )

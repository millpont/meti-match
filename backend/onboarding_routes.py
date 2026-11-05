"""Self-service role registration — replaces METI's admin-linking model.

A first-time Auth0 login gets an auth0_users row with account_id NULL (see auth.py). These
endpoints are how that gets resolved: each creates the accounts row (role fixed per endpoint),
the matching role-profile row, and links auth0_users.account_id — a few sequential sb.py calls,
same read-modify-write approach as the rest of this codebase (no cross-table transaction; fine
at this scale since a user only ever completes onboarding once).

Account setup is intentionally minimal: name, company/organization name, the last 4 digits of
the company's EIN, phone, and email — then straight into the platform. Nothing role-specific
(farm state, buyer country, production data, certs, requirements, program affiliation) is asked
here; a grower/buyer/operator fills that in as they actually use the platform (offers, bids,
requirements, the grower profile screen), matching how little of it is read anywhere besides its
own display. See migrations/0015_account_setup.sql for the schema change this enabled.

A company can hold more than one role at once (e.g. a Trader/Service Provider that also runs its
own Program Operator grain program) — see migrations/0022_multi_role_accounts.sql. This module
also covers adding an extra role to an already-onboarded account, and switching which role is
ACTIVE for the current session (which dashboard renders) among the roles that account holds.

See plans/meti-match/02-data-model.md (schema) and 03-api-plan.md (this blueprint's spec).
"""
import logging
import re

from flask import Blueprint, request, jsonify, session

import sb
from auth import requires_auth
from config import config
from db import account_roles_for_id, claimable_account_for_email, role_switching_enabled_for_id
from notifications_routes import notify

logger = logging.getLogger(__name__)
onboarding_bp = Blueprint("onboarding", __name__)

EIN_LAST4_RE = re.compile(r"^\d{4}$")
# Every role an account can be REGISTERED as, or JOIN an existing company as. All four — someone
# must still be able to join an existing Service Provider company.
ONBOARDABLE_ROLES = ("grower", "program_operator", "international_buyer", "service_provider")
# Roles an already-onboarded account can ADD to itself / switch into. service_provider is
# deliberately absent: it's a singular role, registered on its own account, not toggled into.
# Secondary service_provider was only ever half-supported anyway — the provider directory and the
# "request a service" lookup both resolve providers by accounts.role (the PRIMARY role), so a
# secondary SP role could never be found or hired. See migrations/0055.
ADDABLE_ROLES = ("grower", "program_operator", "international_buyer")


def _auth0_sub():
    return session["profile"]["user_id"]


def _already_onboarded():
    rows = sb.select("auth0_users", {"auth0_id": f"eq.{_auth0_sub()}", "select": "account_id", "limit": 1})
    return bool(rows and rows[0].get("account_id"))


def _validate_contact(data):
    """The shared account-setup fields every role collects the same way. Returns an error
    string, or None if valid."""
    for field in ("name", "company", "phone", "email"):
        if not (data.get(field) or "").strip():
            return f"Missing required field: {field}"
    # No longer collected at signup (business identifiers moved to the Profile tab — see
    # business_verification.py), but still accepted and validated if an older client sends it.
    ein = (data.get("ein_last4") or "").strip()
    if ein and not EIN_LAST4_RE.match(ein):
        return "ein_last4 must be exactly 4 digits"
    return None


def _create_role_profile(role, account_id, name, is_trader=False):
    """The minimal profile row for a role, keyed by account_id — same shape whether this runs
    at initial onboarding or later via add_role()."""
    if role == "grower":
        sb.insert("grower_profiles", {
            "account_id": account_id, "farm_name": name,
            "primary_crops": [], "conservation_practices": [],
        }, return_representation=False)
    elif role == "program_operator":
        sb.insert("program_operator_profiles", {
            "account_id": account_id, "organization_name": name, "states_covered": [],
            # Neither flag gates anything in the app today (an operator can enroll growers and
            # post offers regardless) — defaulted true so the account isn't artificially
            # restricted just because signup no longer asks.
            "aggregates_from_growers": True, "offers_own_grain": True, "verified_practices": [],
        }, return_representation=False)
    elif role == "international_buyer":
        sb.insert("international_buyer_profiles", {
            "account_id": account_id, "company_name": name,
            "commodities_of_interest": [], "required_attributes": [], "destination_ports": [],
        }, return_representation=False)
    elif role == "service_provider":
        sb.insert("service_provider_profiles", {
            "account_id": account_id, "company_name": name, "is_trader": bool(is_trader),
        }, return_representation=False)


def _create_account_and_link(role, data):
    """Insert the accounts row (identity + contact fields shared across every role), seed its
    primary role into account_roles, link auth0_users to it, and stash it on the session.
    Returns (account_id, company)."""
    company = data["company"].strip()
    account = sb.insert("accounts", {
        "role": role,
        "name": company,
        "contact_name": data["name"].strip(),
        "contact_phone": data["phone"].strip(),
        "contact_email": data["email"].strip(),
        "ein_last4": (data.get("ein_last4") or "").strip() or None,
        # Dormant unless a superadmin has turned approval on (off by default, so signups aren't
        # blocked during early testing) — see config.ACCOUNT_APPROVAL_REQUIRED and
        # migrations/0053_account_approval_status.sql. Only new-company registrations go through
        # this; joining an existing company already goes through that company's own admin.
        "approval_status": "pending" if config.ACCOUNT_APPROVAL_REQUIRED else "approved",
    })
    account_id = str(account["id"])
    sb.insert("account_roles", {"account_id": account_id, "role": role}, return_representation=False)
    # The first person to claim a company name is its company-level admin — able to approve or
    # decline other logins that later ask to join this same company (see /api/onboarding/join
    # below and migrations/0024_company_join_requests.sql).
    sb.update("auth0_users", {"auth0_id": f"eq.{_auth0_sub()}"}, {"account_id": account_id, "is_company_admin": True})
    session["account_id"] = account_id
    session["role"] = role
    session["roles"] = [role]
    session["account_name"] = company
    # Seed the approval gate immediately rather than waiting for the first /api/me poll to set
    # it — otherwise a just-registered pending account could use the API in the window before the
    # SPA asks who it is. Always False while ACCOUNT_APPROVAL_REQUIRED is off.
    session["approval_pending"] = config.ACCOUNT_APPROVAL_REQUIRED
    return account_id, company


@onboarding_bp.route("/api/onboarding/grower", methods=["POST"])
@requires_auth
def onboard_grower():
    if _already_onboarded():
        return jsonify({"error": "account already exists"}), 400
    data = request.get_json() or {}
    problem = _validate_contact(data)
    if problem:
        return jsonify({"error": problem}), 400

    account_id, farm_name = _create_account_and_link("grower", data)
    _create_role_profile("grower", account_id, farm_name)
    return jsonify({"success": True, "account_id": account_id, "role": "grower"})


@onboarding_bp.route("/api/onboarding/operator", methods=["POST"])
@requires_auth
def onboard_operator():
    if _already_onboarded():
        return jsonify({"error": "account already exists"}), 400
    data = request.get_json() or {}
    problem = _validate_contact(data)
    if problem:
        return jsonify({"error": problem}), 400

    account_id, organization_name = _create_account_and_link("program_operator", data)
    _create_role_profile("program_operator", account_id, organization_name)
    return jsonify({"success": True, "account_id": account_id, "role": "program_operator"})


@onboarding_bp.route("/api/onboarding/buyer", methods=["POST"])
@requires_auth
def onboard_buyer():
    if _already_onboarded():
        return jsonify({"error": "account already exists"}), 400
    data = request.get_json() or {}
    problem = _validate_contact(data)
    if problem:
        return jsonify({"error": problem}), 400

    account_id, company_name = _create_account_and_link("international_buyer", data)
    _create_role_profile("international_buyer", account_id, company_name)
    return jsonify({"success": True, "account_id": account_id, "role": "international_buyer"})


@onboarding_bp.route("/api/onboarding/service_provider", methods=["POST"])
@requires_auth
def onboard_service_provider():
    if _already_onboarded():
        return jsonify({"error": "account already exists"}), 400
    data = request.get_json() or {}
    problem = _validate_contact(data)
    if problem:
        return jsonify({"error": problem}), 400

    account_id, company_name = _create_account_and_link("service_provider", data)
    _create_role_profile("service_provider", account_id, company_name, is_trader=bool(data.get("is_trader")))
    return jsonify({"success": True, "account_id": account_id, "role": "service_provider"})


@onboarding_bp.route("/api/roles", methods=["POST"])
@requires_auth
def add_role():
    """Add an extra role to an already-onboarded account — e.g. a Program Operator that's also a
    Trader (Service Provider) for its own separate grain program. Creates that role's minimal
    profile row (same defaults as onboarding) and switches the session to it immediately. Only
    accounts a superadmin has opted in via the Accounts page can do this at all (see
    migrations/0026_role_switching_toggle.sql) — checked fresh from the DB, not a session cache,
    same as is_company_admin, so a superadmin flipping the toggle takes effect immediately."""
    acct = session.get("account_id")
    if not acct:
        return jsonify({"error": "no account access"}), 403
    if not role_switching_enabled_for_id(acct):
        return jsonify({"error": "role switching is not enabled for this account"}), 403
    role = (request.get_json() or {}).get("role")
    if role not in ADDABLE_ROLES:
        return jsonify({"error": f"role must be one of {ADDABLE_ROLES}"}), 400
    existing = sb.select("account_roles", {"account_id": f"eq.{acct}", "role": f"eq.{role}", "select": "role", "limit": 1})
    if existing:
        return jsonify({"error": "you already have this role"}), 400

    name = session.get("account_name") or ""
    _create_role_profile(role, acct, name)
    sb.insert("account_roles", {"account_id": acct, "role": role}, return_representation=False)
    roles = session.get("roles") or []
    session["roles"] = roles + [role]
    session["role"] = role
    return jsonify({"success": True, "role": role, "roles": session["roles"]})


@onboarding_bp.route("/api/onboarding/companies", methods=["GET"])
@requires_auth
def search_companies():
    """Populates the "join an existing company" step of registration — any authenticated login,
    even one with no account yet. Only surfaces roles a company already holds; joining under a
    role the company doesn't have yet isn't offered here (that's what already-onboarded members
    use POST /api/roles for, once they're in). An optional `role` filter (used now that role is
    picked before company — see onboarding_routes.py's flow, Onboarding.tsx) narrows results to
    companies that already hold it, so the join request underneath never has to reject a role
    mismatch the search itself should have prevented.

    With a `q` of at least 2 characters, this is a name search (up to 20 matches). With no `q`
    but a `role`, it's a "browse all" listing for that role instead (up to 50, alphabetical) —
    populates the dropdown alternative to typing a search, for someone who'd rather just pick
    their company off a list. Neither `q` nor `role` returns nothing; browsing every company on
    the platform with no role scope isn't a real use case here."""
    q = (request.args.get("q") or "").strip()
    role_filter = (request.args.get("role") or "").strip() or None
    if len(q) >= 2:
        accounts = sb.select("accounts", {"name": f"ilike.*{q}*", "select": "id,name", "order": "name.asc", "limit": 20})
    elif role_filter:
        account_ids = {str(r["account_id"]) for r in sb.select("account_roles", {"role": f"eq.{role_filter}", "select": "account_id"})}
        if not account_ids:
            return jsonify({"success": True, "companies": []})
        accounts = sb.select("accounts", {"id": f"in.({','.join(account_ids)})", "select": "id,name", "order": "name.asc", "limit": 50})
    else:
        return jsonify({"success": True, "companies": []})
    if not accounts:
        return jsonify({"success": True, "companies": []})
    ids = {str(a["id"]) for a in accounts}
    roles_by_account = {}
    for r in sb.select("account_roles", {"account_id": f"in.({','.join(ids)})", "select": "account_id,role"}):
        roles_by_account.setdefault(str(r["account_id"]), []).append(r["role"])
    companies = [
        {"id": str(a["id"]), "name": a["name"], "roles": sorted(roles_by_account.get(str(a["id"]), []))}
        for a in accounts
    ]
    if role_filter:
        companies = [c for c in companies if role_filter in c["roles"]]
    return jsonify({"success": True, "companies": companies})


@onboarding_bp.route("/api/onboarding/join", methods=["POST"])
@requires_auth
def request_join():
    """A new login asks to join an existing company under one of the roles it already holds —
    the alternative to onboarding a brand-new company. Requires approval from that company's
    admin or a superadmin (see company_routes.py)."""
    if _already_onboarded():
        return jsonify({"error": "account already exists"}), 400
    data = request.get_json() or {}
    account_id = data.get("account_id")
    role = data.get("role")
    if not account_id or role not in ONBOARDABLE_ROLES:
        return jsonify({"error": "account_id and a valid role are required"}), 400

    account_rows = sb.select("accounts", {"id": f"eq.{account_id}", "select": "name", "limit": 1})
    if not account_rows:
        return jsonify({"error": "company not found"}), 404
    held_roles = {r["role"] for r in sb.select("account_roles", {"account_id": f"eq.{account_id}", "select": "role"})}
    if role not in held_roles:
        return jsonify({"error": "this company doesn't have that role"}), 400

    existing = sb.select("account_join_requests", {
        "auth0_id": f"eq.{_auth0_sub()}", "status": "eq.pending", "select": "id", "limit": 1,
    })
    if existing:
        return jsonify({"error": "you already have a pending join request"}), 400

    created = sb.insert("account_join_requests", {"auth0_id": _auth0_sub(), "account_id": account_id, "role": role})
    requester = sb.select("auth0_users", {"auth0_id": f"eq.{_auth0_sub()}", "select": "email,first_name,last_name", "limit": 1})
    who = requester[0] if requester else {}
    email = who.get("email") or "unknown email"
    display = (f"{who.get('first_name', '')} {who.get('last_name', '')}".strip()) or email
    notify(
        account_id, "join_request_received",
        title=f"{display} wants to join {account_rows[0]['name']} as {role.replace('_', ' ')}",
        body=f"Signed in as {email}. A company admin can approve or decline this from their dashboard.",
        link_type="join_request", link_id=created["id"],
    )
    return jsonify({"success": True})


@onboarding_bp.route("/api/switch-role", methods=["POST"])
@requires_auth
def switch_role():
    """Change which role is ACTIVE for this session (which dashboard renders) — not persisted;
    login always starts back on the account's primary role. Same superadmin-toggle gate as
    add_role — an account that's never allowed to add a role also shouldn't be able to switch
    among roles it happened to already hold (e.g. from before the toggle was turned off)."""
    acct = session.get("account_id")
    if not acct:
        return jsonify({"error": "no account access"}), 403
    if not role_switching_enabled_for_id(acct):
        return jsonify({"error": "role switching is not enabled for this account"}), 403
    role = (request.get_json() or {}).get("role")
    held = set(session.get("roles") or [])
    if role not in held:
        return jsonify({"error": "you don't have this role"}), 400
    # Service Provider is a singular role — it lives on its own account and is never switched
    # into, even by an account that still holds it from before (see ADDABLE_ROLES). Switching in
    # produced a half-working state: the dashboard flipped but the profile editor, the provider
    # directory and the "request a service" lookup all resolve by accounts.role, so the session
    # role was the only thing that ever changed.
    if role == "service_provider":
        return jsonify({
            "error": "Service Provider is a standalone role — register it as its own account "
                     "rather than switching into it.",
        }), 400
    session["role"] = role
    return jsonify({"success": True, "role": role})


@onboarding_bp.route("/api/onboarding/claim", methods=["POST"])
@requires_auth
def claim_operator_created_account():
    """Take over a grower account a program operator registered on this person's behalf
    (enrollments_routes.py's create_grower_account), instead of creating a duplicate. Only the
    account db.claimable_account_for_email offers this login — matched on a VERIFIED email — can
    be claimed; the client-supplied id just has to agree with it."""
    if _already_onboarded():
        return jsonify({"error": "account already exists"}), 400
    claimable = claimable_account_for_email(session["profile"])
    requested = (request.get_json() or {}).get("account_id")
    if not claimable or str(requested) != claimable["id"]:
        return jsonify({"error": "no claimable account for this login"}), 404
    account_id = claimable["id"]
    sb.update("auth0_users", {"auth0_id": f"eq.{_auth0_sub()}"}, {"account_id": account_id, "is_company_admin": True})
    session["account_id"] = account_id
    session["role"] = "grower"
    session["roles"] = account_roles_for_id(account_id)
    session["account_name"] = claimable["name"]
    session["approval_pending"] = False
    return jsonify({"success": True, "account_id": account_id})

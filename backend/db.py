"""Data access via the Supabase REST API (see sb.py for why — the host's IP is not on the DB
allow-list, but REST is reachable). No direct Postgres connection is used at runtime."""
import sb


def account_id_for_auth0(auth0_id):
    """Map a logged-in Auth0 subject to their custodian account_id (or None)."""
    rows = sb.select("auth0_users", {"auth0_id": f"eq.{auth0_id}", "select": "account_id", "limit": 1})
    if rows and rows[0].get("account_id"):
        return str(rows[0]["account_id"])
    return None


def account_name_for_id(account_id):
    """Human-readable name for a custodian account_id (or None)."""
    if not account_id:
        return None
    rows = sb.select("accounts", {"id": f"eq.{account_id}", "select": "name", "limit": 1})
    if rows and rows[0].get("name"):
        return str(rows[0]["name"]).strip()
    return None


def display_name_for_id(account_id):
    """The account owner's self-chosen personal display name (or None) -- distinct from
    account_name_for_id's company name. See profile_routes.py's EDITABLE_FIELDS."""
    if not account_id:
        return None
    rows = sb.select("accounts", {"id": f"eq.{account_id}", "select": "display_name", "limit": 1})
    if rows and rows[0].get("display_name"):
        return str(rows[0]["display_name"]).strip()
    return None


def approval_state(account_id):
    """(approval_status, approval_note) for a new-account superadmin approval — 'pending' |
    'approved' | 'declined', see migrations/0053_account_approval_status.sql. Every pre-existing
    account, and every account created while config.ACCOUNT_APPROVAL_REQUIRED is off, is
    'approved'. Returns (None, None) when there's no account yet."""
    if not account_id:
        return None, None
    rows = sb.select("accounts", {"id": f"eq.{account_id}", "select": "approval_status,approval_note", "limit": 1})
    if not rows:
        return None, None
    return rows[0].get("approval_status") or "approved", rows[0].get("approval_note")


def account_role_for_id(account_id):
    """Role for a custodian account_id (grower/program_operator/international_buyer/
    service_provider/admin), or None if the account has no role yet (shouldn't happen once
    onboarding has created the account, since role is required at creation)."""
    if not account_id:
        return None
    rows = sb.select("accounts", {"id": f"eq.{account_id}", "select": "role", "limit": 1})
    if rows and rows[0].get("role"):
        return str(rows[0]["role"])
    return None


def account_roles_for_id(account_id):
    """Every role this account holds (see migrations/0022_multi_role_accounts.sql) — a
    single-role account just gets a one-item list matching account_role_for_id."""
    if not account_id:
        return []
    rows = sb.select("account_roles", {"account_id": f"eq.{account_id}", "select": "role", "order": "role.asc"})
    return [str(r["role"]) for r in rows]


def is_company_admin_for_auth0(auth0_id):
    """Whether this login is the company-level admin for its account — the first person to
    register that company name (see onboarding_routes.py's _create_account_and_link) — able to
    approve or decline other logins asking to join (see migrations/0024_company_join_requests.sql
    and company_routes.py)."""
    rows = sb.select("auth0_users", {"auth0_id": f"eq.{auth0_id}", "select": "is_company_admin", "limit": 1})
    return bool(rows and rows[0].get("is_company_admin"))


def pending_join_request_for_auth0(auth0_id):
    """Most recent request (if any) from a login with no account yet to join an existing
    company — lets the SPA show a waiting/declined screen instead of the onboarding wizard."""
    rows = sb.select("account_join_requests", {
        "auth0_id": f"eq.{auth0_id}", "select": "id,account_id,role,status,created_at",
        "order": "created_at.desc", "limit": 1,
    })
    if not rows:
        return None
    row = rows[0]
    return {
        "id": str(row["id"]), "account_id": str(row["account_id"]),
        "account_name": account_name_for_id(row["account_id"]),
        "role": row["role"], "status": row["status"], "created_at": row["created_at"],
    }


def role_switching_enabled_for_id(account_id):
    """Whether this account is allowed to add/switch roles at all — a superadmin-controlled
    per-account toggle (see migrations/0026_role_switching_toggle.sql and
    admin_routes.py's toggle_role_switching), not something every account gets by default."""
    if not account_id:
        return False
    rows = sb.select("accounts", {"id": f"eq.{account_id}", "select": "role_switching_enabled", "limit": 1})
    return bool(rows and rows[0].get("role_switching_enabled"))


def account_freeze_state(account_id):
    """(frozen, frozen_reason) for a custodian account_id — checked at login (auth.py's
    callback), not on every request; an admin freezing someone mid-session takes effect the
    next time they log in, matching how this was scoped when asked for."""
    if not account_id:
        return False, None
    rows = sb.select("accounts", {"id": f"eq.{account_id}", "select": "frozen,frozen_reason", "limit": 1})
    if not rows:
        return False, None
    return bool(rows[0].get("frozen")), rows[0].get("frozen_reason")


def claimable_account_for_email(profile):
    """A grower account a program operator registered on this person's behalf (by their email)
    that no login has claimed yet — offered to them at onboarding instead of a blank signup.
    Only for a VERIFIED Auth0 email: otherwise anyone could register that address and take the
    account over. Returns {id, name, operator_name} or None."""
    email = (profile.get("email") or "").strip().lower()
    if not email or not profile.get("email_verified"):
        return None
    # Exact match (not ilike — "_" and "%" in an address are LIKE wildcards). Operator-created
    # accounts store contact_email lowercased for exactly this lookup.
    rows = sb.select("accounts", {
        "contact_email": f"eq.{email}", "created_by_operator_account_id": "not.is.null",
        "select": "id,name,created_by_operator_account_id", "order": "created_at.desc",
    })
    for r in rows:
        if sb.select("auth0_users", {"account_id": f"eq.{r['id']}", "select": "auth0_id", "limit": 1}):
            continue
        op = sb.select("accounts", {"id": f"eq.{r['created_by_operator_account_id']}", "select": "name", "limit": 1})
        return {"id": str(r["id"]), "name": r.get("name"), "operator_name": op[0]["name"] if op else None}
    return None

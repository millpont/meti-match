"""A program operator's enrolled-grower roster (page 10's "Enrolled Growers" table), plus the
grower-initiated side of the same relationship: a grower can request to join an operator's
program (at onboarding or later), and the operator approves/declines it from this same roster.

Two ways a program_enrollments row gets created:
  - Operator-entered, by name only (grower_account_id stays null) — for a grower not yet on the
    platform. See create_enrollment.
  - Grower-initiated, tied to a real account (grower_name_freeform stays null) — see
    _create_affiliation_request, used by both /api/program-affiliation/request and
    onboarding_routes.py's optional program_operator_account_id field.

A grower may have at most one active-or-pending affiliation at a time (matches the mockup's
single-select "Program Affiliation" dropdown and grower_profiles.program_affiliation being a
single column, not a list). Approving a request (status -> 'active') sets that column; declining
is just the operator removing the pending row (delete_enrollment) — no separate status needed."""
import logging

from flask import Blueprint, request, jsonify, session

import sb
import inventory_routes
from auth import requires_auth
from notifications_routes import notify

logger = logging.getLogger(__name__)
enrollments_bp = Blueprint("enrollments", __name__)

TABLE = "program_enrollments"
# 'invited' (operator asked an already-registered grower, awaiting the grower) is only ever set
# by invite_grower — the PATCH below can still only move a row between active and pending.
VALID_STATUS = ("active", "pending")


def _require_operator():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    if session.get("role") != "program_operator":
        return None, (jsonify({"error": "only program operators manage enrollments"}), 403)
    return str(acct), None


def _require_grower():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    if session.get("role") != "grower":
        return None, (jsonify({"error": "only growers have a program affiliation"}), 403)
    return str(acct), None


def _num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _int(v):
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def _account_name(account_id):
    rows = sb.select("accounts", {"id": f"eq.{account_id}", "select": "name", "limit": 1})
    return rows[0].get("name") if rows else None


def _has_standing_affiliation(grower_account_id):
    """Active, or a grower-initiated request still pending — the one-affiliation-at-a-time rule.
    Outstanding operator invitations don't count: a grower can hold several and accept one."""
    return bool(sb.select(TABLE, {
        "grower_account_id": f"eq.{grower_account_id}", "status": "in.(active,pending)",
        "select": "id", "limit": 1,
    }))


def _enrollment_json(row):
    d = dict(row)
    d["id"] = str(d["id"])
    d["program_operator_account_id"] = str(d["program_operator_account_id"])
    d["grower_account_id"] = str(d["grower_account_id"]) if d.get("grower_account_id") else None
    d["acres_enrolled"] = _num(d.get("acres_enrolled"))
    return d


@enrollments_bp.route("/api/program-operators", methods=["GET"])
@requires_auth
def list_program_operators():
    """Any authenticated user — used by the grower onboarding wizard / program-affiliation
    picker to populate its dropdown. Just id + name, nothing sensitive."""
    rows = sb.select("accounts", {"role": "eq.program_operator", "select": "id,name", "order": "name.asc"})
    return jsonify({"success": True, "program_operators": [{"id": str(r["id"]), "name": r["name"]} for r in rows]})


@enrollments_bp.route("/api/enrollments", methods=["POST"])
@requires_auth
def create_enrollment():
    acct, err = _require_operator()
    if err:
        return err
    data = request.get_json() or {}
    grower_name = (data.get("grower_name_freeform") or "").strip()
    if not grower_name:
        return jsonify({"error": "Missing required field: grower_name_freeform"}), 400
    status = data.get("status", "active")
    if status not in VALID_STATUS:
        return jsonify({"error": f"status must be one of {VALID_STATUS}"}), 400

    row = {
        "program_operator_account_id": acct,
        "grower_name_freeform": grower_name,
        "grower_email": (data.get("grower_email") or "").strip() or None,
        "farms_count": _int(data.get("farms_count")),
        "acres_enrolled": _num(data.get("acres_enrolled")),
        "primary_practices": _as_list(data.get("primary_practices")),
        "status": status,
    }
    created = sb.insert(TABLE, row)
    return jsonify({"success": True, "enrollment": _enrollment_json(created)})


def active_enrollment_for(operator_account_id, grower_account_id):
    """The active enrollment row tying this grower to this operator, or None. Used to gate an
    operator creating an offer on this grower's behalf (offers_routes.py)."""
    rows = sb.select(TABLE, {
        "program_operator_account_id": f"eq.{operator_account_id}",
        "grower_account_id": f"eq.{grower_account_id}", "status": "eq.active",
        "select": "*", "limit": 1,
    })
    return rows[0] if rows else None


def committed_acres(operator_account_id, grower_account_id):
    """Acres already tied up in this operator's on-behalf-of offers for this grower — a
    withdrawn or declined offer frees its acres back up; draft/pending/published/accepted all
    still count against the grower's enrolled acres."""
    rows = sb.select("offers", {
        "created_by": f"eq.{operator_account_id}",
        "on_behalf_of_grower_account_id": f"eq.{grower_account_id}",
        "status": "neq.withdrawn", "grower_approval_status": "neq.declined",
        "select": "acres_offered",
    })
    return sum(_num(r.get("acres_offered")) or 0 for r in rows)


def remaining_enrolled_acres(operator_account_id, grower_account_id):
    """(enrollment_row, remaining_acres) for an operator about to create an on-behalf-of offer.
    remaining is None if the grower has no acres_enrolled on file (nothing to cap against);
    enrollment is None if they aren't actively enrolled with this operator at all."""
    enrollment = active_enrollment_for(operator_account_id, grower_account_id)
    if not enrollment:
        return None, None
    enrolled = _num(enrollment.get("acres_enrolled"))
    if enrolled is None:
        return enrollment, None
    return enrollment, enrolled - committed_acres(operator_account_id, grower_account_id)


def active_enrolled_grower_ids(operator_account_id):
    """Grower account ids actively enrolled in this operator's program. Used for the operator's
    reporting rollup (dashboard stats combine the operator's own activity with these growers') —
    ownership/contracts/negotiation stay entirely with the grower; this is a read-only combined
    total, not a transfer of any kind. See contracts_routes.py's my_stats and my_enrollments below."""
    rows = sb.select(TABLE, {
        "program_operator_account_id": f"eq.{operator_account_id}", "status": "eq.active", "select": "grower_account_id",
    })
    return {str(r["grower_account_id"]) for r in rows if r.get("grower_account_id")}


@enrollments_bp.route("/api/enrollments/growers-inventory", methods=["GET"])
@requires_auth
def growers_inventory():
    """Read-only insight into the inventory of the growers in an operator's program — the
    grower keeps sole ownership of and write access to their own inventory (see
    inventory_routes.py); this only surfaces it to the operator who represents them, same
    read-only-rollup spirit as my_enrollments' program_rollup below."""
    acct, err = _require_operator()
    if err:
        return err
    grower_ids = active_enrolled_grower_ids(acct)
    if not grower_ids:
        return jsonify({"success": True, "growers_inventory": []})
    names = {
        str(a["id"]): a.get("name")
        for a in sb.select("accounts", {"id": f"in.({','.join(grower_ids)})", "select": "id,name"})
    }
    rows = sb.select("grower_inventory", {
        "account_id": f"in.({','.join(grower_ids)})", "order": "commodity.asc,marketing_year.desc", "select": "*",
    })
    out = []
    for r in rows:
        gid = str(r["account_id"])
        d = dict(r)
        d["id"] = str(d["id"])
        d["account_id"] = gid
        d["grower_name"] = names.get(gid)
        d["total_volume"] = float(r["total_volume"]) if r.get("total_volume") is not None else None
        d["total_acres"] = float(r["total_acres"]) if r.get("total_acres") is not None else None
        if r["quantity_basis"] == "grain":
            _, remaining = inventory_routes.remaining_volume(gid, r["commodity"], r["marketing_year"])
            d["remaining_volume"] = remaining
            d["remaining_acres"] = None
        else:
            _, remaining = inventory_routes.remaining_acres(gid, r["commodity"], r["marketing_year"])
            d["remaining_volume"] = None
            d["remaining_acres"] = remaining
        out.append(d)
    return jsonify({"success": True, "growers_inventory": out})


@enrollments_bp.route("/api/enrollments/mine", methods=["GET"])
@requires_auth
def my_enrollments():
    acct, err = _require_operator()
    if err:
        return err
    rows = sb.select(TABLE, {
        "program_operator_account_id": f"eq.{acct}", "order": "created_at.desc", "select": "*",
    })

    grower_ids = {str(r["grower_account_id"]) for r in rows if r.get("grower_account_id")}
    names = {}
    if grower_ids:
        for a in sb.select("accounts", {"id": f"in.({','.join(grower_ids)})", "select": "id,name"}):
            names[str(a["id"])] = a.get("name")

    out = []
    for r in rows:
        d = _enrollment_json(r)
        # A grower-initiated request has no grower_name_freeform — fall back to their account name.
        d["grower_account_name"] = names.get(d["grower_account_id"]) if d["grower_account_id"] else None
        out.append(d)

    # Reporting rollup: published offers across the operator's own account + active enrolled
    # growers'. Count only, not a volume sum — offers mix bushels/MT (see offers.uom), so summing
    # expected_volume across them without unit conversion would be misleading.
    active_grower_ids = {str(r["grower_account_id"]) for r in rows if r.get("grower_account_id") and r["status"] == "active"}
    program_account_ids = active_grower_ids | {acct}
    program_offers = sb.select("offers", {
        "created_by": f"in.({','.join(program_account_ids)})", "status": "eq.published", "select": "id",
    })

    return jsonify({
        "success": True,
        "enrollments": out,
        "program_rollup": {"published_offers_count": len(program_offers)},
    })


@enrollments_bp.route("/api/enrollments/active-growers", methods=["GET"])
@requires_auth
def active_growers_for_offers():
    """Enrolled growers an operator can create an on-behalf-of offer for, with each one's
    remaining acres balance — powers OfferForm's operator-only picker. A freeform-only
    enrollment (no real account) is left out — there's no one to approve anything."""
    acct, err = _require_operator()
    if err:
        return err
    rows = sb.select(TABLE, {
        "program_operator_account_id": f"eq.{acct}", "status": "eq.active",
        "select": "grower_account_id,acres_enrolled",
    })
    grower_ids = [str(r["grower_account_id"]) for r in rows if r.get("grower_account_id")]
    names = {}
    if grower_ids:
        for a in sb.select("accounts", {"id": f"in.({','.join(grower_ids)})", "select": "id,name"}):
            names[str(a["id"])] = a.get("name")

    out = []
    for r in rows:
        grower_id = r.get("grower_account_id")
        if not grower_id:
            continue
        grower_id = str(grower_id)
        remaining = None
        enrolled = _num(r.get("acres_enrolled"))
        if enrolled is not None:
            remaining = enrolled - committed_acres(acct, grower_id)
        out.append({
            "grower_account_id": grower_id,
            "grower_name": names.get(grower_id),
            "acres_enrolled": enrolled,
            "acres_remaining": remaining,
        })
    return jsonify({"success": True, "growers": out})


def _owned_enrollment(enrollment_id, acct):
    rows = sb.select(TABLE, {"id": f"eq.{enrollment_id}", "select": "*", "limit": 1})
    if not rows:
        return None, (jsonify({"error": "enrollment not found"}), 404)
    if str(rows[0]["program_operator_account_id"]) != acct:
        return None, (jsonify({"error": "only the enrolling operator can change this"}), 403)
    return rows[0], None


@enrollments_bp.route("/api/enrollments/<enrollment_id>", methods=["PATCH"])
@requires_auth
def update_enrollment(enrollment_id):
    acct, err = _require_operator()
    if err:
        return err
    row, owned_err = _owned_enrollment(enrollment_id, acct)
    if owned_err:
        return owned_err

    data = request.get_json() or {}
    patch = {}
    if "grower_email" in data:
        patch["grower_email"] = (data.get("grower_email") or "").strip() or None
    if "farms_count" in data:
        patch["farms_count"] = _int(data["farms_count"])
    if "acres_enrolled" in data:
        patch["acres_enrolled"] = _num(data["acres_enrolled"])
    if "primary_practices" in data:
        patch["primary_practices"] = _as_list(data["primary_practices"])
    if "status" in data:
        # Only the grower can answer an invitation (accept_invitation below) — otherwise an
        # operator could flip their own invite to active without the grower ever agreeing.
        if row["status"] == "invited":
            return jsonify({"error": "this grower hasn't accepted your invitation yet"}), 400
        if data["status"] not in VALID_STATUS:
            return jsonify({"error": f"status must be one of {VALID_STATUS}"}), 400
        patch["status"] = data["status"]
    if not patch:
        return jsonify({"error": "nothing to update"}), 400
    sb.update(TABLE, {"id": f"eq.{enrollment_id}"}, patch)

    # Approving a grower-initiated request sets their standing affiliation. A freeform (not yet
    # on the platform) enrollment has no grower_account_id, so there's no profile to update.
    if patch.get("status") == "active" and row.get("grower_account_id"):
        sb.update("grower_profiles", {"account_id": f"eq.{row['grower_account_id']}"}, {
            "program_affiliation": acct,
        })
        if row.get("status") == "pending":
            notify(
                row["grower_account_id"], "enrollment_approved",
                title=f"{_account_name(acct) or 'The program operator'} approved your request to join their program",
                link_type="enrollment", link_id=enrollment_id,
            )
    return jsonify({"success": True})


@enrollments_bp.route("/api/enrollments/<enrollment_id>", methods=["DELETE"])
@requires_auth
def delete_enrollment(enrollment_id):
    acct, err = _require_operator()
    if err:
        return err
    _row, owned_err = _owned_enrollment(enrollment_id, acct)
    if owned_err:
        return owned_err
    sb.delete(TABLE, {"id": f"eq.{enrollment_id}"})
    return jsonify({"success": True})


@enrollments_bp.route("/api/enrollments/discoverable-growers", methods=["GET"])
@requires_auth
def discoverable_growers():
    """Every registered grower who opted in via "Open to Program Enrollment" on their Profile,
    each tagged with where they stand relative to THIS operator — rather than silently leaving
    out the ones that can't be invited, which made a just-opted-in grower look missing:
      available            — invitable
      in_your_program      — already actively enrolled with you
      requested_to_join    — asked to join your program; approve it from your roster
      invited              — you've already invited them
      in_another_program   — active/pending with another operator (one program at a time)
    The whole list comes back (it's opt-in only, so small); the SPA does the searching. `q` is
    still honored as an exact-email match for someone who knows the grower's address. No contact
    fields are returned — the invite itself is how the operator reaches them."""
    acct, err = _require_operator()
    if err:
        return err
    q = (request.args.get("q") or "").strip().lower()
    profiles = sb.select("grower_profiles", {
        "open_to_program_enrollment": "eq.true", "select": "account_id,farm_name,state,total_acres",
    })
    if not profiles:
        return jsonify({"success": True, "growers": []})
    ids = [str(p["account_id"]) for p in profiles]
    accounts = {
        str(a["id"]): a
        for a in sb.select("accounts", {
            "id": f"in.({','.join(ids)})", "select": "id,name,contact_email,frozen",
        })
    }
    relationship = {}
    for r in sb.select(TABLE, {
        "grower_account_id": f"in.({','.join(ids)})", "status": "in.(active,pending,invited)",
        "select": "grower_account_id,program_operator_account_id,status",
    }):
        gid = str(r["grower_account_id"])
        mine = str(r["program_operator_account_id"]) == acct
        if mine:
            tag = {"active": "in_your_program", "pending": "requested_to_join", "invited": "invited"}[r["status"]]
        elif r["status"] in ("active", "pending"):
            tag = "in_another_program"
        else:
            continue  # another operator's outstanding invite doesn't stop you inviting too
        # Your own relationship wins over another program's when (unusually) both exist.
        if gid not in relationship or mine:
            relationship[gid] = tag

    out = []
    for p in profiles:
        gid = str(p["account_id"])
        a = accounts.get(gid)
        if not a or a.get("frozen") or gid == acct:
            continue
        if q and "@" in q and q != (a.get("contact_email") or "").strip().lower():
            continue
        out.append({
            "grower_account_id": gid,
            "farm_name": p.get("farm_name") or a.get("name"),
            "account_name": a.get("name"),
            "state": p.get("state"),
            "total_acres": _num(p.get("total_acres")),
            "relationship": relationship.get(gid, "available"),
        })
    out.sort(key=lambda g: (g["farm_name"] or "").lower())
    return jsonify({"success": True, "growers": out})


@enrollments_bp.route("/api/enrollments/invite", methods=["POST"])
@requires_auth
def invite_grower():
    """Ask an already-registered (and opted-in) grower to join this operator's program. Lands as
    an 'invited' row the grower accepts or declines from their Program tab."""
    acct, err = _require_operator()
    if err:
        return err
    data = request.get_json() or {}
    grower_id = str(data.get("grower_account_id") or "")
    if not grower_id:
        return jsonify({"error": "grower_account_id is required"}), 400
    profile = sb.select("grower_profiles", {
        "account_id": f"eq.{grower_id}", "select": "open_to_program_enrollment,total_acres,conservation_practices", "limit": 1,
    })
    if not profile or not profile[0].get("open_to_program_enrollment"):
        return jsonify({"error": "this grower isn't open to program invitations"}), 400
    if _has_standing_affiliation(grower_id):
        return jsonify({"error": "this grower is already in (or has asked to join) a program"}), 400
    if sb.select(TABLE, {
        "program_operator_account_id": f"eq.{acct}", "grower_account_id": f"eq.{grower_id}",
        "status": "eq.invited", "select": "id", "limit": 1,
    }):
        return jsonify({"error": "you've already invited this grower"}), 400
    acres = _num(data.get("acres_enrolled"))
    created = sb.insert(TABLE, {
        "program_operator_account_id": acct,
        "grower_account_id": grower_id,
        "acres_enrolled": acres if acres is not None else _num(profile[0].get("total_acres")),
        "primary_practices": _as_list(profile[0].get("conservation_practices")),
        "status": "invited",
    })
    notify(
        grower_id, "enrollment_invited",
        title=f"{_account_name(acct) or 'A program operator'} invited you to join their program",
        body="Review the invitation in your Program tab.",
        link_type="enrollment", link_id=created["id"],
    )
    return jsonify({"success": True, "enrollment": _enrollment_json(created)})


@enrollments_bp.route("/api/enrollments/create-grower", methods=["POST"])
@requires_auth
def create_grower_account():
    """Register a brand-new grower on their behalf — the operator is acting for a grower who
    isn't on the platform yet. Creates a real grower ACCOUNT (not a name-only roster row), so the
    operator can list for/aggregate them straight away, and enrolls it as active immediately
    (the operator created it, so there's nobody to ask). The grower takes the account over later
    by logging in with this email — see onboarding_routes.py's claim endpoint."""
    acct, err = _require_operator()
    if err:
        return err
    data = request.get_json() or {}
    farm_name = (data.get("farm_name") or "").strip()
    contact_name = (data.get("contact_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    if not farm_name:
        return jsonify({"error": "Farm name is required"}), 400
    if not email or "@" not in email:
        return jsonify({"error": "A valid email is required — it's how the grower claims this account"}), 400
    if sb.select("accounts", {"contact_email": f"eq.{email}", "select": "id", "limit": 1}) or \
            sb.select("auth0_users", {"email": f"ilike.{email}", "account_id": "not.is.null", "select": "auth0_id", "limit": 1}):
        return jsonify({
            "error": "Someone with this email is already registered — find them under “Invite a registered grower” instead.",
        }), 400

    account = sb.insert("accounts", {
        "role": "grower",
        "name": farm_name,
        "contact_name": contact_name or None,
        "contact_phone": (data.get("phone") or "").strip() or None,
        "contact_email": email,
        "approval_status": "approved",
        "created_by_operator_account_id": acct,
    })
    grower_id = str(account["id"])
    sb.insert("account_roles", {"account_id": grower_id, "role": "grower"}, return_representation=False)
    sb.insert("grower_profiles", {
        "account_id": grower_id, "farm_name": farm_name,
        "primary_crops": [], "conservation_practices": _as_list(data.get("primary_practices")),
        "total_acres": _num(data.get("acres_enrolled")),
        "program_affiliation": acct,
    }, return_representation=False)
    created = sb.insert(TABLE, {
        "program_operator_account_id": acct,
        "grower_account_id": grower_id,
        "grower_email": email,
        "farms_count": _int(data.get("farms_count")),
        "acres_enrolled": _num(data.get("acres_enrolled")),
        "primary_practices": _as_list(data.get("primary_practices")),
        "status": "active",
    })
    return jsonify({"success": True, "enrollment": _enrollment_json(created), "grower_account_id": grower_id})


@enrollments_bp.route("/api/enrollments/growers/<grower_account_id>/production-data", methods=["GET"])
@requires_auth
def enrolled_grower_production_data(grower_account_id):
    """Read-only view of an actively-enrolled grower's Production Data defaults, so an operator
    can review them (and copy them into their own). Same read-only-insight spirit as
    growers_inventory above — the grower keeps sole write access."""
    acct, err = _require_operator()
    if err:
        return err
    if not active_enrollment_for(acct, grower_account_id):
        return jsonify({"error": "this grower is not actively enrolled in your program"}), 403
    import production_data_routes
    marketing_year = request.args.get("marketing_year") or production_data_routes.ANY_YEAR
    return jsonify({
        "success": True,
        "grower_name": _account_name(grower_account_id),
        "commodities": production_data_routes.production_entries_for(grower_account_id, marketing_year),
    })


# ------- grower-initiated program affiliation -------

def create_affiliation_request(grower_account_id, program_operator_account_id):
    """Shared by /api/program-affiliation/request and onboarding_routes.py's optional
    program_operator_account_id field. Returns (enrollment_row, error_response)."""
    if _has_standing_affiliation(grower_account_id):
        return None, (jsonify({"error": "You already have an active or pending program affiliation"}), 400)

    operator_rows = sb.select("accounts", {"id": f"eq.{program_operator_account_id}", "select": "role", "limit": 1})
    if not operator_rows or operator_rows[0].get("role") != "program_operator":
        return None, (jsonify({"error": "program operator not found"}), 404)

    profile_rows = sb.select("grower_profiles", {"account_id": f"eq.{grower_account_id}", "select": "total_acres,conservation_practices", "limit": 1})
    profile = profile_rows[0] if profile_rows else {}

    created = sb.insert(TABLE, {
        "program_operator_account_id": program_operator_account_id,
        "grower_account_id": grower_account_id,
        "acres_enrolled": _num(profile.get("total_acres")),
        "primary_practices": _as_list(profile.get("conservation_practices")),
        "status": "pending",
    })
    notify(
        program_operator_account_id, "enrollment_requested",
        title=f"{_account_name(grower_account_id) or 'A grower'} asked to join your program",
        body="Approve or decline it under Enrolled Growers.",
        link_type="enrollment", link_id=created["id"],
    )
    return created, None


@enrollments_bp.route("/api/program-affiliation/request", methods=["POST"])
@requires_auth
def request_affiliation():
    acct, err = _require_grower()
    if err:
        return err
    program_operator_account_id = (request.get_json() or {}).get("program_operator_account_id")
    if not program_operator_account_id:
        return jsonify({"error": "program_operator_account_id is required"}), 400
    created, err = create_affiliation_request(acct, program_operator_account_id)
    if err:
        return err
    return jsonify({"success": True, "enrollment": _enrollment_json(created)})


@enrollments_bp.route("/api/program-affiliation", methods=["GET"])
@requires_auth
def my_affiliation():
    acct, err = _require_grower()
    if err:
        return err
    rows = sb.select(TABLE, {
        "grower_account_id": f"eq.{acct}", "status": "in.(active,pending)",
        "order": "created_at.desc", "select": "*", "limit": 1,
    })
    if not rows:
        return jsonify({"success": True, "affiliation": None})
    row = rows[0]
    op_rows = sb.select("accounts", {"id": f"eq.{row['program_operator_account_id']}", "select": "name", "limit": 1})
    d = _enrollment_json(row)
    d["program_operator_name"] = op_rows[0]["name"] if op_rows else None
    return jsonify({"success": True, "affiliation": d})


@enrollments_bp.route("/api/program-affiliation/<enrollment_id>", methods=["DELETE"])
@requires_auth
def cancel_affiliation_request(enrollment_id):
    """A grower can cancel their own PENDING request. Leaving an already-active program isn't
    supported yet — that's a bigger "what happens to your offers" question, out of scope here."""
    acct, err = _require_grower()
    if err:
        return err
    rows = sb.select(TABLE, {"id": f"eq.{enrollment_id}", "select": "grower_account_id,status", "limit": 1})
    if not rows:
        return jsonify({"error": "not found"}), 404
    row = rows[0]
    if str(row.get("grower_account_id")) != acct:
        return jsonify({"error": "not your request"}), 403
    if row["status"] != "pending":
        return jsonify({"error": "only a pending request can be cancelled"}), 400
    sb.delete(TABLE, {"id": f"eq.{enrollment_id}"})
    return jsonify({"success": True})


@enrollments_bp.route("/api/program-affiliation/invitations", methods=["GET"])
@requires_auth
def my_invitations():
    """Outstanding operator invitations for this grower (status 'invited')."""
    acct, err = _require_grower()
    if err:
        return err
    rows = sb.select(TABLE, {"grower_account_id": f"eq.{acct}", "status": "eq.invited", "order": "created_at.desc", "select": "*"})
    op_ids = {str(r["program_operator_account_id"]) for r in rows}
    names = {}
    if op_ids:
        names = {str(a["id"]): a.get("name") for a in sb.select("accounts", {"id": f"in.({','.join(op_ids)})", "select": "id,name"})}
    out = []
    for r in rows:
        d = _enrollment_json(r)
        d["program_operator_name"] = names.get(d["program_operator_account_id"])
        out.append(d)
    return jsonify({"success": True, "invitations": out})


def _own_invitation(enrollment_id, acct):
    rows = sb.select(TABLE, {"id": f"eq.{enrollment_id}", "select": "*", "limit": 1})
    if not rows or str(rows[0].get("grower_account_id")) != acct or rows[0]["status"] != "invited":
        return None, (jsonify({"error": "invitation not found"}), 404)
    return rows[0], None


@enrollments_bp.route("/api/program-affiliation/invitations/<enrollment_id>/accept", methods=["POST"])
@requires_auth
def accept_invitation(enrollment_id):
    acct, err = _require_grower()
    if err:
        return err
    row, err = _own_invitation(enrollment_id, acct)
    if err:
        return err
    if _has_standing_affiliation(acct):
        return jsonify({"error": "You already have an active or pending program affiliation"}), 400
    sb.update(TABLE, {"id": f"eq.{enrollment_id}"}, {"status": "active"})
    sb.update("grower_profiles", {"account_id": f"eq.{acct}"}, {"program_affiliation": str(row["program_operator_account_id"])})
    # One program at a time: accepting this invitation answers every other outstanding one.
    sb.delete(TABLE, {"grower_account_id": f"eq.{acct}", "status": "eq.invited"})
    notify(
        row["program_operator_account_id"], "enrollment_accepted",
        title=f"{_account_name(acct) or 'A grower'} accepted your invitation and joined your program",
        link_type="enrollment", link_id=enrollment_id,
    )
    return jsonify({"success": True})


@enrollments_bp.route("/api/program-affiliation/invitations/<enrollment_id>/decline", methods=["POST"])
@requires_auth
def decline_invitation(enrollment_id):
    acct, err = _require_grower()
    if err:
        return err
    row, err = _own_invitation(enrollment_id, acct)
    if err:
        return err
    sb.delete(TABLE, {"id": f"eq.{enrollment_id}"})
    notify(
        row["program_operator_account_id"], "enrollment_declined",
        title=f"{_account_name(acct) or 'A grower'} declined your program invitation",
        link_type="enrollment", link_id=enrollment_id,
    )
    return jsonify({"success": True})

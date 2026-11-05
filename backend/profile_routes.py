"""Profile system (Phase 10 Pass 1) — photo/bio/links/contact-visibility, shared identically
across all 4 roles since these are account-level concepts, not role-specific (see
migrations/0035_account_profile_fields.sql). Two surfaces:

- `GET`/`PUT /api/profile` + photo upload/delete — my own profile, editable only by its own
  account.
- `GET /api/accounts/<id>/public-profile` — anyone else's profile, read-only, the answer to
  Phase 9 item 71 ("see profile of who the offer is from, including User score"). Contact fields
  are included only when that account has explicitly turned `contact_visible` on — they've never
  left the account boundary before this feature, so the default stays closed until opted in.
"""
import logging
import re
import uuid

from flask import Blueprint, request, jsonify, session

import sb
import storage
import reputation
from auth import requires_auth

logger = logging.getLogger(__name__)
profile_bp = Blueprint("profile", __name__)

TABLE = "accounts"
GALLERY_TABLE = "account_gallery_photos"
SP_TABLE = "service_provider_profiles"
PHOTO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
PHOTO_EXTENSIONS = ("jpg", "jpeg", "png", "webp", "gif")
# Fields the owning account may edit about itself — company `name` (the historical match key for
# company-join-requests) stays immutable through self-service, unlike everything below.
EDITABLE_FIELDS = ("display_name", "bio", "website_url", "contact_visible", "contact_name", "contact_phone", "contact_email")
# service_provider_profiles fields — only editable, and only present in the response, when the
# ACCOUNT's role (accounts.role, not the session's active role) is service_provider. Live on a
# separate table from `accounts`.
#
# GET and PUT must agree on where that role comes from: the GET has always read accounts.role
# while the PUT read session["role"], which meant an account that had switched into a secondary
# service_provider role could have a write accepted that the read would never show back. Service
# Provider is now a singular role (see onboarding_routes.py's ADDABLE_ROLES), so accounts.role is
# the one correct source and both paths use it.
SP_EDITABLE_FIELDS = ("services_offered", "states_covered")


def _require_account():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    return str(acct), None


def photo_url(photo_path):
    if not photo_path:
        return None
    try:
        # A photo renders inline, repeatedly (dashboard header, cards, this profile view) rather
        # than being fetched once for a download link — a longer expiry than the 300s document
        # default avoids it going stale mid-session.
        return storage.signed_url(photo_path, expires_in=3600)
    except storage.StorageError as e:
        logger.error("profile photo signed url failed: %s", e)
        return None


def _normalize_url(url):
    """A bare domain like "plantgroup.co" (no scheme) renders as a same-origin relative link in
    an <a href> — the browser resolves it against the current page instead of treating it as an
    external site. Defaulting a missing scheme to https:// is what every browser address bar
    already does with typed-in bare domains, so it's the least surprising fix here."""
    url = (url or "").strip()
    if url and not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", url):
        url = f"https://{url}"
    return url


def _as_links(value):
    if not isinstance(value, list):
        return []
    out = []
    for item in value:
        if not isinstance(item, dict):
            continue
        url = _normalize_url(item.get("url"))
        if not url:
            continue
        out.append({"label": (item.get("label") or "").strip() or url, "url": url})
    return out


def _gallery_photos_json(account_id):
    rows = sb.select(GALLERY_TABLE, {"account_id": f"eq.{account_id}", "select": "*", "order": "created_at.asc"})
    return [{"id": str(r["id"]), "url": photo_url(r.get("path")), "caption": r.get("caption")} for r in rows]


def _get_sp_row(account_id):
    rows = sb.select(SP_TABLE, {"account_id": f"eq.{account_id}", "select": "services_offered,states_covered,is_trader", "limit": 1})
    return rows[0] if rows else None


def _as_str_list(value):
    if not isinstance(value, list):
        return []
    return [str(v).strip() for v in value if str(v).strip()]


def _own_profile_json(row, include_gallery=True):
    out = {
        "account_id": str(row["id"]),
        "role": row.get("role"),
        "name": row.get("name"),
        "display_name": row.get("display_name"),
        "photo_url": photo_url(row.get("photo_path")),
        "bio": row.get("bio"),
        "website_url": row.get("website_url"),
        "links": row.get("links") or [],
        # Each gallery photo needs its own signed-URL round trip (see photo_url) — skip the
        # lookup entirely for a lightweight caller (e.g. ProfileHomeCard) that never shows it.
        "gallery_photos": _gallery_photos_json(str(row["id"])) if include_gallery else [],
        "contact_visible": bool(row.get("contact_visible")),
        "contact_name": row.get("contact_name"),
        "contact_phone": row.get("contact_phone"),
        "contact_email": row.get("contact_email"),
    }
    if row.get("role") == "service_provider":
        sp_row = _get_sp_row(str(row["id"])) or {}
        out["services_offered"] = sp_row.get("services_offered") or []
        out["states_covered"] = sp_row.get("states_covered") or []
        out["is_trader"] = bool(sp_row.get("is_trader"))
    grower_row = _get_grower_row(str(row["id"]))
    if grower_row is not None:
        out["open_to_program_enrollment"] = bool(grower_row.get("open_to_program_enrollment"))
    return out


def _get_grower_row(account_id):
    """The account's grower_profiles row, if it holds the grower role at all (primary or
    added) — that's what makes the "Open to Program Enrollment" opt-in apply."""
    rows = sb.select("grower_profiles", {"account_id": f"eq.{account_id}", "select": "open_to_program_enrollment", "limit": 1})
    return rows[0] if rows else None


def _get_account_row(account_id, select="*"):
    rows = sb.select(TABLE, {"id": f"eq.{account_id}", "select": select, "limit": 1})
    return rows[0] if rows else None


@profile_bp.route("/api/profile", methods=["GET"])
@requires_auth
def get_profile():
    acct, err = _require_account()
    if err:
        return err
    row = _get_account_row(acct)
    if not row:
        return jsonify({"error": "account not found"}), 404
    include_gallery = request.args.get("summary") != "1"
    return jsonify({"success": True, "profile": _own_profile_json(row, include_gallery=include_gallery)})


@profile_bp.route("/api/profile", methods=["PUT"])
@requires_auth
def update_profile():
    acct, err = _require_account()
    if err:
        return err
    data = request.get_json() or {}

    patch = {}
    for f in EDITABLE_FIELDS:
        if f not in data:
            continue
        if f == "contact_visible":
            patch[f] = bool(data[f])
        elif f == "website_url":
            patch[f] = _normalize_url(data[f]) or None
        else:
            patch[f] = (data[f] or "").strip() or None
    if "links" in data:
        patch["links"] = _as_links(data["links"])

    sp_patch = {}
    # accounts.role, not session["role"] — see SP_EDITABLE_FIELDS' comment for why these have to
    # agree with the GET.
    account_row = _get_account_row(acct, select="role")
    if account_row and account_row.get("role") == "service_provider":
        for f in SP_EDITABLE_FIELDS:
            if f in data:
                sp_patch[f] = _as_str_list(data[f])
        if "is_trader" in data:
            sp_patch["is_trader"] = bool(data["is_trader"])

    grower_patch = {}
    if "open_to_program_enrollment" in data and _get_grower_row(acct) is not None:
        grower_patch["open_to_program_enrollment"] = bool(data["open_to_program_enrollment"])

    if not patch and not sp_patch and not grower_patch:
        return jsonify({"error": "nothing to update"}), 400

    if patch:
        updated = sb.update(TABLE, {"id": f"eq.{acct}"}, patch, return_representation=True)
        if not updated:
            return jsonify({"error": "account not found"}), 404
    if sp_patch:
        sb.update(SP_TABLE, {"account_id": f"eq.{acct}"}, sp_patch)
    if grower_patch:
        sb.update("grower_profiles", {"account_id": f"eq.{acct}"}, grower_patch)

    row = _get_account_row(acct)
    if not row:
        return jsonify({"error": "account not found"}), 404
    return jsonify({"success": True, "profile": _own_profile_json(row)})


@profile_bp.route("/api/profile/photo", methods=["POST"])
@requires_auth
def upload_profile_photo():
    acct, err = _require_account()
    if err:
        return err
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "file is required"}), 400
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in PHOTO_EXTENSIONS:
        return jsonify({"error": f"photo must be one of: {', '.join(PHOTO_EXTENSIONS)}"}), 400
    data = file.read()
    if len(data) > PHOTO_MAX_UPLOAD_BYTES:
        return jsonify({"error": "file too large (5MB max)"}), 400

    path = f"{acct}/profile/photo.{ext}"
    try:
        storage.upload(path, data, file.mimetype or "application/octet-stream")
    except storage.StorageError as e:
        logger.error("profile photo upload failed: %s", e)
        return jsonify({"error": "upload failed"}), 502

    updated = sb.update(TABLE, {"id": f"eq.{acct}"}, {"photo_path": path}, return_representation=True)
    return jsonify({"success": True, "profile": _own_profile_json(updated[0])})


@profile_bp.route("/api/profile/photo", methods=["DELETE"])
@requires_auth
def delete_profile_photo():
    acct, err = _require_account()
    if err:
        return err
    row = _get_account_row(acct, select="photo_path")
    path = row.get("photo_path") if row else None
    if path:
        try:
            storage.delete(path)
        except storage.StorageError as e:
            logger.warning("profile photo delete failed (continuing): %s", e)
    updated = sb.update(TABLE, {"id": f"eq.{acct}"}, {"photo_path": None}, return_representation=True)
    return jsonify({"success": True, "profile": _own_profile_json(updated[0])})


@profile_bp.route("/api/profile/gallery-photos", methods=["POST"])
@requires_auth
def upload_gallery_photo():
    """Adds one photo (e.g. of the farm) to the account's gallery — additive, unlike the single
    avatar's replace-in-place upload, since a gallery has many independent photos each needing a
    stable id to later remove."""
    acct, err = _require_account()
    if err:
        return err
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "file is required"}), 400
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in PHOTO_EXTENSIONS:
        return jsonify({"error": f"photo must be one of: {', '.join(PHOTO_EXTENSIONS)}"}), 400
    data = file.read()
    if len(data) > PHOTO_MAX_UPLOAD_BYTES:
        return jsonify({"error": "file too large (5MB max)"}), 400
    caption = (request.form.get("caption") or "").strip() or None

    photo_id = str(uuid.uuid4())
    path = f"{acct}/profile/gallery/{photo_id}.{ext}"
    try:
        storage.upload(path, data, file.mimetype or "application/octet-stream")
    except storage.StorageError as e:
        logger.error("gallery photo upload failed: %s", e)
        return jsonify({"error": "upload failed"}), 502

    sb.insert(GALLERY_TABLE, {"id": photo_id, "account_id": acct, "path": path, "caption": caption}, return_representation=False)
    row = _get_account_row(acct)
    return jsonify({"success": True, "profile": _own_profile_json(row)})


@profile_bp.route("/api/profile/gallery-photos/<photo_id>", methods=["DELETE"])
@requires_auth
def delete_gallery_photo(photo_id):
    acct, err = _require_account()
    if err:
        return err
    rows = sb.select(GALLERY_TABLE, {"id": f"eq.{photo_id}", "select": "account_id,path", "limit": 1})
    if not rows:
        return jsonify({"error": "photo not found"}), 404
    if str(rows[0]["account_id"]) != acct:
        return jsonify({"error": "only the owning account can remove this photo"}), 403
    path = rows[0].get("path")
    if path:
        try:
            storage.delete(path)
        except storage.StorageError as e:
            logger.warning("gallery photo delete failed (continuing): %s", e)
    sb.delete(GALLERY_TABLE, {"id": f"eq.{photo_id}"})
    row = _get_account_row(acct)
    return jsonify({"success": True, "profile": _own_profile_json(row)})


@profile_bp.route("/api/accounts/<account_id>/public-profile", methods=["GET"])
@requires_auth
def get_public_profile(account_id):
    _acct, err = _require_account()
    if err:
        return err
    row = _get_account_row(account_id)
    if not row:
        return jsonify({"error": "account not found"}), 404

    contact_visible = bool(row.get("contact_visible"))
    out = {
        "account_id": str(row["id"]),
        "role": row.get("role"),
        "name": row.get("name"),
        "display_name": row.get("display_name"),
        "photo_url": photo_url(row.get("photo_path")),
        "bio": row.get("bio"),
        "website_url": row.get("website_url"),
        "links": row.get("links") or [],
        "gallery_photos": _gallery_photos_json(str(row["id"])),
        "contact_visible": contact_visible,
        "reputation": reputation.score_for_account(str(row["id"])),
    }
    if row.get("role") == "service_provider":
        sp_row = _get_sp_row(str(row["id"])) or {}
        out["services_offered"] = sp_row.get("services_offered") or []
        out["states_covered"] = sp_row.get("states_covered") or []
        out["is_trader"] = bool(sp_row.get("is_trader"))
    if contact_visible:
        out["contact_name"] = row.get("contact_name")
        out["contact_phone"] = row.get("contact_phone")
        out["contact_email"] = row.get("contact_email")
    return jsonify({"success": True, "profile": out})

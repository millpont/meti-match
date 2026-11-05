"""Producer production data (page 7's "Production Data Progress" bars). Growers and program
operators (operators grow/aggregate grain too — see program_operator_profiles.offers_own_grain).

Per-commodity: a grower who grows both corn and soybeans keeps separate practice records
(GRAIN_COMMODITIES' five crops — corn/soybeans/sorghum/wheat/barley — each get their own section
regardless of whether the grower actually grows all of them; an unused one just stays at 0%).
A specific offer can override any of these fields for that listing only — see offers_routes.py's
override_* columns and resolve_production(), which merges an offer's overrides with these
per-commodity defaults for display."""
import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, session

import sb
import storage
from auth import requires_auth

logger = logging.getLogger(__name__)
production_data_bp = Blueprint("production_data", __name__)

TABLE = "production_data"
VALID_IRRIGATION = ("dryland", "rainfed", "irrigated")
VALID_YIELD_UNIT = ("bu/acre", "MT/acre")
VALID_MANURE_TYPE = ("dairy", "beef", "swine", "poultry")
ADVANCED_FIELDS = ("actual_yield_per_acre", "irrigation_type", "crop_rotation_years", "input_usage_notes")
# USDA Feedstock Carbon Intensity Calculator (FD-CIC) criteria — scoped to this page only, no
# offer-side override_* mirrors (see migrations/0048_production_data_usda_fdcic.sql).
FDCIC_NUMERIC_FIELDS = (
    "nitrogen_lbs_per_acre", "nitrification_inhibitor_fraction", "synthetic_phosphorus_lbs_per_acre",
    "synthetic_potassium_lbs_per_acre", "lime_dolomite_lbs_per_acre", "herbicide_lbs_per_acre",
    "insecticide_lbs_per_acre", "fungicide_lbs_per_acre", "manure_lbs_per_acre", "tdisc_score",
    "diesel_gal_per_acre", "gasoline_gal_per_acre", "natural_gas_total_therms", "lpg_total_gallons",
    "electricity_kwh_per_acre",
)
COMMODITIES = ("Corn", "Soybeans", "Sorghum", "Wheat", "Barley")
# Soybeans and Wheat are hidden for now (some clients would see them as competitive) — still
# valid for writes so nothing already saved breaks, just not offered as a section. Mirrors the
# frontend's GRAIN_COMMODITIES.
VISIBLE_COMMODITIES = ("Corn", "Sorghum", "Barley")
# PostgREST filter for the Marketplace's browse/matching/directory queries — hidden crops' existing
# listings stay in the DB (and on their owner's My Listings, and in admin views), just off the
# public Marketplace. Dropping this filter brings them straight back.
VISIBLE_COMMODITY_FILTER = f"in.({','.join(VISIBLE_COMMODITIES)})"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
# "Applies to any marketing year" sentinel — a NULL can't be part of a primary key, so this is
# used instead (see migrations/0047_production_data_per_year.sql). Every pre-existing row became
# this fallback row when the column was added, so nothing already saved was lost.
ANY_YEAR = "any"


def _now():
    return datetime.now(timezone.utc).isoformat()


def _require_producer():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    if session.get("role") not in ("grower", "program_operator"):
        return None, (jsonify({"error": "only growers and program operators have production data"}), 403)
    return str(acct), None


def _num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# Multi-select sections that count toward completion once answered — a grower with genuinely none
# of these picks the "None" option (NONE_OPTION), which counts as answered, so having no
# specialty attribute no longer caps them below 100%.
COMPLETION_LIST_FIELDS = ("conservation_practices", "sustainability_attributes", "specialty_attributes")
NONE_OPTION = "None"


def _advanced_completion_pct(row):
    if not row:
        return 0
    filled = sum(1 for f in ADVANCED_FIELDS if row.get(f) not in (None, ""))
    filled += sum(1 for f in COMPLETION_LIST_FIELDS if row.get(f))
    return round(filled / (len(ADVANCED_FIELDS) + len(COMPLETION_LIST_FIELDS)) * 100)


def _document_url(path):
    if not path:
        return None
    try:
        return storage.signed_url(path)
    except storage.StorageError as e:
        logger.error("verification document signed url failed: %s", e)
        return None


def _entry(row):
    doc_path = row.get("verification_document_path") if row else None
    soil_doc_path = row.get("soil_test_document_path") if row else None
    out = {
        "advanced_completion_pct": _advanced_completion_pct(row),
        "actual_yield_per_acre": _num(row.get("actual_yield_per_acre")) if row else None,
        "yield_unit": row.get("yield_unit") if row else None,
        "irrigation_type": row.get("irrigation_type") if row else None,
        "crop_rotation_years": _num(row.get("crop_rotation_years")) if row else None,
        "crop_rotation_crops": _num(row.get("crop_rotation_crops")) if row else None,
        "soil_test_on_file": bool(row.get("soil_test_on_file")) if row else False,
        "third_party_verified": bool(row.get("third_party_verified")) if row else False,
        "input_usage_notes": row.get("input_usage_notes") if row else None,
        "conservation_practices": (row.get("conservation_practices") or []) if row else [],
        "sustainability_attributes": (row.get("sustainability_attributes") or []) if row else [],
        "specialty_attributes": (row.get("specialty_attributes") or []) if row else [],
        "has_verification_document": bool(doc_path),
        "verification_document_url": _document_url(doc_path),
        "has_soil_test_document": bool(soil_doc_path),
        "soil_test_document_url": _document_url(soil_doc_path),
        "manure_type": row.get("manure_type") if row else None,
        "show_advanced_in_listing": bool(row.get("show_advanced_in_listing")) if row else False,
    }
    for f in FDCIC_NUMERIC_FIELDS:
        out[f] = _num(row.get(f)) if row else None
    return out


OVERRIDE_TO_DEFAULT = {
    "override_actual_yield_per_acre": "actual_yield_per_acre",
    "override_yield_unit": "yield_unit",
    "override_irrigation_type": "irrigation_type",
    "override_crop_rotation_years": "crop_rotation_years",
    "override_crop_rotation_crops": "crop_rotation_crops",
    "override_soil_test_on_file": "soil_test_on_file",
    "override_third_party_verified": "third_party_verified",
    "override_input_usage_notes": "input_usage_notes",
    # A list works fine in this generic "is not None -> it's an override" merge same as the
    # scalars above — an empty list is a legitimate override (explicitly no practices for this
    # lot), distinct from None (inherit the commodity default).
    "override_conservation_practices": "conservation_practices",
}


def _lookup_default(account_id, commodity, marketing_year):
    """Exact (account_id, commodity, marketing_year) row if one exists, else the ANY_YEAR
    fallback row for that account+commodity, else None."""
    year = marketing_year or ANY_YEAR
    rows = sb.select(TABLE, {
        "account_id": f"eq.{account_id}", "commodity": f"eq.{commodity}",
        "marketing_year": f"eq.{year}", "select": "*", "limit": 1,
    })
    if rows:
        return rows[0]
    if year != ANY_YEAR:
        rows = sb.select(TABLE, {
            "account_id": f"eq.{account_id}", "commodity": f"eq.{commodity}",
            "marketing_year": f"eq.{ANY_YEAR}", "select": "*", "limit": 1,
        })
        if rows:
            return rows[0]
    return None


def resolve_production(created_by, commodity, offer_row, prefetched_default="_unset", marketing_year=None):
    """Merge an offer's override_* fields with its grower's per-commodity production_data
    default, for display on a listing. Used by offers_routes.py's _offer_json — a buyer browsing
    supply has no other way to see a grower's production_data (that endpoint is scoped to the
    caller's own account), so the resolved view has to be attached to the offer itself.

    `marketing_year` (the offer's own marketing year) picks the exact year-specific default row
    if one exists, falling back to the ANY_YEAR row otherwise — see
    migrations/0047_production_data_per_year.sql.

    `prefetched_default` lets a caller that's already batch-fetched every relevant
    production_data row (see offers_routes.py's _offer_json_batch) pass it straight in instead of
    this function running its own one-row-at-a-time query — the sentinel default (rather than
    None) distinguishes "not passed, go fetch it" from "passed, and there genuinely isn't one"."""
    if prefetched_default != "_unset":
        default = prefetched_default
    else:
        default = _lookup_default(created_by, commodity, marketing_year)

    resolved = {}
    has_override = False
    for override_key, default_key in OVERRIDE_TO_DEFAULT.items():
        v = offer_row.get(override_key)
        if v is not None:
            resolved[default_key] = v
            has_override = True
        else:
            resolved[default_key] = default.get(default_key) if default else None

    resolved["actual_yield_per_acre"] = _num(resolved.get("actual_yield_per_acre"))
    resolved["crop_rotation_years"] = _num(resolved.get("crop_rotation_years"))
    resolved["crop_rotation_crops"] = _num(resolved.get("crop_rotation_crops"))
    resolved["soil_test_on_file"] = bool(resolved.get("soil_test_on_file"))
    resolved["third_party_verified"] = bool(resolved.get("third_party_verified"))
    # "None" only exists to mark the section answered on the Production Data page — a listing
    # just shows no practices.
    resolved["conservation_practices"] = [p for p in (resolved.get("conservation_practices") or []) if p != NONE_OPTION]
    resolved["has_override"] = has_override
    resolved["has_default"] = default is not None

    # Documents aren't override_* columns (a file, not a scalar) — an offer's own attachment (if
    # uploaded, see offers_routes.py's upload_offer_document) takes precedence over the
    # commodity-default one.
    doc_path = offer_row.get("override_verification_document_path") or (default.get("verification_document_path") if default else None)
    resolved["has_verification_document"] = bool(doc_path)
    resolved["verification_document_url"] = _document_url(doc_path)

    soil_doc_path = offer_row.get("override_soil_test_document_path") or (default.get("soil_test_document_path") if default else None)
    resolved["has_soil_test_document"] = bool(soil_doc_path)
    resolved["soil_test_document_url"] = _document_url(soil_doc_path)

    # USDA FD-CIC advanced fields have no offer-level override — they're private by default and
    # only ever shown on a listing when the grower has explicitly opted that commodity+year's
    # defaults in via show_advanced_in_listing (migrations/0051).
    show_advanced = bool(default.get("show_advanced_in_listing")) if default else False
    resolved["show_advanced_in_listing"] = show_advanced
    resolved["manure_type"] = (default.get("manure_type") if default and show_advanced else None)
    for f in FDCIC_NUMERIC_FIELDS:
        resolved[f] = _num(default.get(f)) if default and show_advanced else None
    return resolved


def production_entries_for(account_id, marketing_year):
    """Every visible commodity's entry for one account + marketing year (falling back to the
    ANY_YEAR row) — the account's own Production Data page, and the read-only view an operator
    gets of an enrolled grower's (enrollments_routes.py)."""
    rows = sb.select(TABLE, {"account_id": f"eq.{account_id}", "select": "*"})
    by_commodity_year = {(r["commodity"], r["marketing_year"]): r for r in rows}
    saved_years_by_commodity = {}
    for r in rows:
        if r["marketing_year"] != ANY_YEAR:
            saved_years_by_commodity.setdefault(r["commodity"], []).append(r["marketing_year"])

    commodities = []
    for c in VISIBLE_COMMODITIES:
        row = by_commodity_year.get((c, marketing_year))
        used_fallback = False
        if row is None and marketing_year != ANY_YEAR:
            row = by_commodity_year.get((c, ANY_YEAR))
            used_fallback = row is not None
        commodities.append({
            "commodity": c,
            "marketing_year": marketing_year,
            "is_fallback_to_any_year": used_fallback,
            "saved_years": sorted(saved_years_by_commodity.get(c, [])),
            **_entry(row),
        })
    return commodities


@production_data_bp.route("/api/production-data", methods=["GET"])
@requires_auth
def get_production_data():
    acct, err = _require_producer()
    if err:
        return err
    marketing_year = request.args.get("marketing_year") or ANY_YEAR
    commodities = production_entries_for(acct, marketing_year)
    return jsonify({"success": True, "commodities": commodities})


@production_data_bp.route("/api/production-data/<commodity>", methods=["PUT"])
@requires_auth
def put_production_data(commodity):
    acct, err = _require_producer()
    if err:
        return err
    if commodity not in COMMODITIES:
        return jsonify({"error": f"commodity must be one of {COMMODITIES}"}), 400
    data = request.get_json() or {}
    marketing_year = (data.get("marketing_year") or ANY_YEAR).strip() or ANY_YEAR
    if data.get("irrigation_type") and data["irrigation_type"] not in VALID_IRRIGATION:
        return jsonify({"error": f"irrigation_type must be one of {VALID_IRRIGATION}"}), 400
    if data.get("yield_unit") and data["yield_unit"] not in VALID_YIELD_UNIT:
        return jsonify({"error": f"yield_unit must be one of {VALID_YIELD_UNIT}"}), 400
    if data.get("manure_type") and data["manure_type"] not in VALID_MANURE_TYPE:
        return jsonify({"error": f"manure_type must be one of {VALID_MANURE_TYPE}"}), 400

    row = {
        "account_id": acct,
        "commodity": commodity,
        "marketing_year": marketing_year,
        "actual_yield_per_acre": _num(data.get("actual_yield_per_acre")),
        "yield_unit": data.get("yield_unit") or None,
        "irrigation_type": data.get("irrigation_type") or None,
        "crop_rotation_years": _num(data.get("crop_rotation_years")),
        "crop_rotation_crops": _num(data.get("crop_rotation_crops")),
        "soil_test_on_file": bool(data.get("soil_test_on_file")),
        "third_party_verified": bool(data.get("third_party_verified")),
        "input_usage_notes": (data.get("input_usage_notes") or "").strip() or None,
        "conservation_practices": data.get("conservation_practices") if isinstance(data.get("conservation_practices"), list) else [],
        "sustainability_attributes": data.get("sustainability_attributes") if isinstance(data.get("sustainability_attributes"), list) else [],
        "specialty_attributes": data.get("specialty_attributes") if isinstance(data.get("specialty_attributes"), list) else [],
        "manure_type": data.get("manure_type") or None,
        "show_advanced_in_listing": bool(data.get("show_advanced_in_listing")),
        "updated_at": _now(),
    }
    for f in FDCIC_NUMERIC_FIELDS:
        row[f] = _num(data.get(f))
    sb.upsert(TABLE, row)
    rows = sb.select(TABLE, {
        "account_id": f"eq.{acct}", "commodity": f"eq.{commodity}", "marketing_year": f"eq.{marketing_year}",
        "select": "*", "limit": 1,
    })
    return jsonify({
        "success": True, "commodity": commodity, "marketing_year": marketing_year,
        **_entry(rows[0] if rows else None),
    })


def _upload_commodity_document(acct, commodity, column, slug):
    """Documents are commodity-level, not per-year — a soil test/verification statement isn't
    re-done every marketing year, and the storage path has no year segment — so these always
    read/write the ANY_YEAR row regardless of which year the caller happens to be viewing."""
    if commodity not in COMMODITIES:
        return jsonify({"error": f"commodity must be one of {COMMODITIES}"}), 400
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "file is required"}), 400
    data = file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        return jsonify({"error": "file too large (10MB max)"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    path = f"{acct}/{commodity}/{slug}.{ext}"
    try:
        storage.upload(path, data, file.mimetype or "application/octet-stream")
    except storage.StorageError as e:
        logger.error("%s upload failed: %s", slug, e)
        return jsonify({"error": "upload failed"}), 502

    sb.upsert(TABLE, {"account_id": acct, "commodity": commodity, "marketing_year": ANY_YEAR, column: path, "updated_at": _now()})
    rows = sb.select(TABLE, {
        "account_id": f"eq.{acct}", "commodity": f"eq.{commodity}", "marketing_year": f"eq.{ANY_YEAR}",
        "select": "*", "limit": 1,
    })
    return jsonify({"success": True, "commodity": commodity, **_entry(rows[0] if rows else None)})


def _delete_commodity_document(acct, commodity, column):
    rows = sb.select(TABLE, {
        "account_id": f"eq.{acct}", "commodity": f"eq.{commodity}", "marketing_year": f"eq.{ANY_YEAR}",
        "select": column, "limit": 1,
    })
    path = rows[0].get(column) if rows else None
    if path:
        try:
            storage.delete(path)
        except storage.StorageError as e:
            logger.warning("%s delete failed (continuing): %s", column, e)
    sb.update(
        TABLE, {"account_id": f"eq.{acct}", "commodity": f"eq.{commodity}", "marketing_year": f"eq.{ANY_YEAR}"},
        {column: None, "updated_at": _now()},
    )
    return jsonify({"success": True})


@production_data_bp.route("/api/production-data/<commodity>/verification-document", methods=["POST"])
@requires_auth
def upload_verification_document(commodity):
    acct, err = _require_producer()
    if err:
        return err
    return _upload_commodity_document(acct, commodity, "verification_document_path", "verification")


@production_data_bp.route("/api/production-data/<commodity>/verification-document", methods=["DELETE"])
@requires_auth
def delete_verification_document(commodity):
    acct, err = _require_producer()
    if err:
        return err
    return _delete_commodity_document(acct, commodity, "verification_document_path")


@production_data_bp.route("/api/production-data/<commodity>/soil-test-document", methods=["POST"])
@requires_auth
def upload_soil_test_document(commodity):
    acct, err = _require_producer()
    if err:
        return err
    return _upload_commodity_document(acct, commodity, "soil_test_document_path", "soil-test")


@production_data_bp.route("/api/production-data/<commodity>/soil-test-document", methods=["DELETE"])
@requires_auth
def delete_soil_test_document(commodity):
    acct, err = _require_producer()
    if err:
        return err
    return _delete_commodity_document(acct, commodity, "soil_test_document_path")

"""US county lookup, seeded from the Census Bureau's county gazetteer (see
migrations/0031_locations.sql). Search is always scoped to a state — county names collide
across states ("Washington County" exists in a dozen), so there's deliberately no way to search
a county without a state to scope it to. See offers_routes.py's `locations` field."""
import logging

from flask import Blueprint, request, jsonify

from auth import requires_auth
import sb

logger = logging.getLogger(__name__)
counties_bp = Blueprint("counties", __name__)

TABLE = "counties"
# Comfortably above the largest state's county count (Texas, 254) — the seed data is a genuine
# complete Census gazetteer (3,143 rows, all 50 states); a lower limit just made browsing a big
# state without typing a search term look like the list was missing counties.
LIMIT = 300


@counties_bp.route("/api/counties", methods=["GET"])
@requires_auth
def search_counties():
    state = (request.args.get("state") or "").strip()
    q = (request.args.get("q") or "").strip()
    if not state:
        return jsonify({"error": "state is required"}), 400
    params = {"state": f"eq.{state}", "select": "name,state", "order": "name.asc", "limit": LIMIT}
    if q:
        params["name"] = f"ilike.*{q}*"
    rows = sb.select(TABLE, params)
    return jsonify({"success": True, "counties": [{"name": r["name"], "state": r["state"]} for r in rows]})

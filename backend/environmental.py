"""Carbon & environmental-data listings — the outcome catalog shared by bids_routes.py and
offers_routes.py. Modeled on meti-v2's Match page outcome types (CI commodity, reductions,
removals, water quantity/quality, acres); see migrations/0062_environmental_listings.sql for how a
non-grain listing maps onto the existing bids/offers columns.

A non-grain listing stores its outcome's label in `commodity`, so every existing reader that
labels a listing by commodity (notifications, responses, contracts) shows the right thing without
knowing about asset classes, and the grower inventory pools (keyed by commodity) never see it."""
from production_data_routes import VISIBLE_COMMODITIES

ASSET_CLASSES = ("grain", "carbon", "environmental")

# key -> label (stored as commodity), unit, asset class. Order is display order.
OUTCOMES = {
    "reductions_t": {"label": "Carbon Reductions", "unit": "tCO2e", "asset_class": "carbon"},
    "removals_t": {"label": "Carbon Removals", "unit": "tCO2e", "asset_class": "carbon"},
    "ci_commodity_t": {"label": "Low-CI Commodity", "unit": "MT", "asset_class": "carbon"},
    "water_quantity": {"label": "Water Savings", "unit": "acre-ft", "asset_class": "environmental"},
    "water_quality_n": {"label": "Avoided Nitrate", "unit": "lbs", "asset_class": "environmental"},
    "water_quality_p": {"label": "Avoided Phosphate", "unit": "lbs", "asset_class": "environmental"},
    "water_quality_tss": {"label": "Avoided Sediment", "unit": "lbs", "asset_class": "environmental"},
    "acres": {"label": "Field-Level Environmental Data", "unit": "acres", "asset_class": "environmental"},
}

OUTCOME_LABELS = tuple(o["label"] for o in OUTCOMES.values())
OUTCOME_BY_LABEL = {o["label"]: key for key, o in OUTCOMES.items()}

ENVIRONMENTAL_BID_TYPE = "environmental_outcome"
OUTCOME_QUANTITY_BASIS = "outcome"

# Everything that can appear on the public Marketplace: the visible crops plus every outcome.
MARKET_COMMODITIES = tuple(VISIBLE_COMMODITIES) + OUTCOME_LABELS
# PostgREST in-filter; values are quoted because outcome labels contain spaces.
MARKET_COMMODITY_FILTER = "in.(" + ",".join(f'"{c}"' for c in MARKET_COMMODITIES) + ")"

MAX_TEXT = 200


def is_environmental(listing):
    return (listing or {}).get("asset_class", "grain") != "grain"


def unit_for(listing):
    """The unit a listing's quantity is in — outcome unit for a non-grain listing, else None
    (callers fall back to their own grain logic)."""
    key = (listing or {}).get("outcome_type")
    return OUTCOMES[key]["unit"] if key in OUTCOMES else None


def _str_list(v):
    if v is None:
        return []
    items = v if isinstance(v, list) else [v]
    return [str(i).strip() for i in items if i is not None and str(i).strip()]


def parse_environmental_fields(data):
    """Validate the shared non-grain fields of a create request. Returns (fields, error) where
    `fields` holds the columns to store, including commodity (the outcome label) and unit."""
    asset_class = data.get("asset_class")
    if asset_class not in ("carbon", "environmental"):
        return None, "asset_class must be carbon or environmental"
    outcome_type = data.get("outcome_type")
    if outcome_type not in OUTCOMES:
        return None, f"outcome_type must be one of {tuple(OUTCOMES)}"
    outcome = OUTCOMES[outcome_type]
    if outcome["asset_class"] != asset_class:
        return None, f"{outcome['label']} is a {outcome['asset_class']} outcome, not {asset_class}"

    vintage_years = _str_list(data.get("vintage_years"))
    if not vintage_years:
        return None, "Select at least one vintage year"
    if any(not (y.isdigit() and len(y) == 4) for y in vintage_years):
        return None, "vintage_years must be four-digit years"

    source_commodities = _str_list(data.get("source_commodities"))
    methodology = (data.get("methodology") or "").strip() or None
    if methodology and len(methodology) > MAX_TEXT:
        return None, f"methodology must be at most {MAX_TEXT} characters"

    return {
        "asset_class": asset_class,
        "outcome_type": outcome_type,
        "commodity": outcome["label"],
        "unit": outcome["unit"],
        "vintage_years": sorted(set(vintage_years), reverse=True),
        "source_states": sorted({s.upper() for s in _str_list(data.get("source_states"))}),
        "source_commodities": source_commodities,
        "methodology": methodology,
    }, None

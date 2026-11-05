"""Grain unit conversion — the single lookup table the client asked for so the matching algo
and the Offer form's Acres/Yield segment can compare bushels, MT, acres, and hectares on equal
footing.

LBS_PER_BUSHEL + LBS_PER_MT are Carlos's team's confirmed conversion factors (standard USDA test
weights per commodity, over the standard lbs/metric-ton ratio) — this was shipped first as a
placeholder using the same standard weights, then checked bushel-for-bushel against the table
Carlos's team actually sent: every figure matches to the precision they gave (their printed
table is just rounded to 4-5 significant figures, e.g. "0.0254" vs the unrounded 0.025401), so no
number here changed. Confirmed pairs (lb/bu, 1 bu -> MT, 1 MT -> bu): corn/sorghum
(56, 0.0254, 39.368), wheat/soybeans (60, 0.0272155, 36.7437), barley (48, 0.021772, 45.9296).
"""

LBS_PER_BUSHEL = {
    "corn": 56,
    "wheat": 60,
    "sorghum": 56,
    "barley": 48,
    "soybeans": 60,
}

# Metric ton in pounds (1000 kg) — the shared constant behind every bushel<->MT conversion above.
LBS_PER_MT = 2204.62262185
ACRES_PER_HECTARE = 2.47105381


def _bushel_weight(commodity):
    key = (commodity or "").strip().lower()
    if key not in LBS_PER_BUSHEL:
        raise ValueError(f"no bushel weight on file for commodity {commodity!r}")
    return LBS_PER_BUSHEL[key]


def bushels_to_mt(bushels, commodity):
    if bushels is None:
        return None
    return bushels * _bushel_weight(commodity) / LBS_PER_MT


def mt_to_bushels(mt, commodity):
    if mt is None:
        return None
    return mt * LBS_PER_MT / _bushel_weight(commodity)


def acres_to_hectares(acres):
    if acres is None:
        return None
    return acres / ACRES_PER_HECTARE


def hectares_to_acres(hectares):
    if hectares is None:
        return None
    return hectares * ACRES_PER_HECTARE


def convert_volume(volume, from_uom, to_uom, commodity):
    """A stored volume in one uom ('bushels' or 'MT') -> the other. Used wherever two volumes
    in potentially different units need to be compared or summed (see offers_routes.py's
    grower-inventory cap check and inventory_routes.committed_volume)."""
    if volume is None or from_uom == to_uom:
        return volume
    mt = volume_to_mt(volume, from_uom, commodity)
    return mt if to_uom == "MT" else mt_to_bushels(mt, commodity)


def volume_to_mt(volume, uom, commodity):
    """A stored expected_volume (already in bushels or MT) -> MT, for apples-to-apples display/
    comparison (see matching_routes.py)."""
    if volume is None:
        return None
    if uom == "MT":
        return volume
    if uom == "bushels":
        return bushels_to_mt(volume, commodity)
    raise ValueError(f"unknown uom {uom!r}")


def yield_to_volume(acres, yield_rate, yield_unit, commodity, target_uom):
    """acres x yield_rate -> total volume in target_uom ('bushels' or 'MT') — the backend-computed
    Total Volume for a 'future'/acres-basis offer (see offers_routes.py's create_offer). acres is
    always in acres (the Acres/hectares toggle is normalized to acres before this is called — see
    frontend/src/units.ts). yield_unit is one of 'bu/acre', 'MT/hectare', 'lbs/acre'."""
    if acres is None or yield_rate is None:
        return None
    if yield_unit == "bu/acre":
        total_bushels = acres * yield_rate
        return total_bushels if target_uom == "bushels" else bushels_to_mt(total_bushels, commodity)
    if yield_unit == "MT/hectare":
        # The rate is per hectare but acres is always in acres — convert the area, not the rate.
        total_mt = acres_to_hectares(acres) * yield_rate
        return total_mt if target_uom == "MT" else mt_to_bushels(total_mt, commodity)
    if yield_unit == "lbs/acre":
        total_mt = acres * yield_rate / LBS_PER_MT
        return total_mt if target_uom == "MT" else mt_to_bushels(total_mt, commodity)
    raise ValueError(f"unknown yield_unit {yield_unit!r}")

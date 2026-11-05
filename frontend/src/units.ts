// Client-side mirror of backend/units.py's acres<->hectares constant — used to normalize
// OfferForm's Acres/hectares area-unit toggle to acres before submitting (the DB and every
// backend acres-cap calculation always stay in acres; area_unit is stored only so the UI can
// redisplay what the grower originally typed).
export const ACRES_PER_HECTARE = 2.47105381;

export function toAcres(value: number, unit: "acres" | "hectares"): number {
  return unit === "hectares" ? value * ACRES_PER_HECTARE : value;
}

export function fromAcres(acres: number, unit: "acres" | "hectares"): number {
  return unit === "hectares" ? acres / ACRES_PER_HECTARE : acres;
}

// Client-side mirror of backend/units.py's yield_to_volume + its LBS_PER_BUSHEL/LBS_PER_MT
// constants — lets OfferForm show a live "Total Volume" preview for an acres-basis offer without
// a network round trip. Keep in sync with backend/units.py if either changes.
const LBS_PER_BUSHEL: Record<string, number> = {
  corn: 56, wheat: 60, sorghum: 56, barley: 48, soybeans: 60,
};
const LBS_PER_MT = 2204.62262185;

function bushelWeight(commodity: string): number | null {
  return LBS_PER_BUSHEL[commodity.trim().toLowerCase()] ?? null;
}

function bushelsToMt(bushels: number, commodity: string): number | null {
  const bw = bushelWeight(commodity);
  return bw ? (bushels * bw) / LBS_PER_MT : null;
}

function mtToBushels(mt: number, commodity: string): number | null {
  const bw = bushelWeight(commodity);
  return bw ? (mt * LBS_PER_MT) / bw : null;
}

export function yieldToVolume(
  acres: number,
  yieldRate: number,
  yieldUnit: "bu/acre" | "MT/hectare" | "lbs/acre",
  commodity: string,
  targetUom: "bushels" | "MT",
): number | null {
  if (yieldUnit === "bu/acre") {
    const totalBushels = acres * yieldRate;
    return targetUom === "bushels" ? totalBushels : bushelsToMt(totalBushels, commodity);
  }
  if (yieldUnit === "MT/hectare") {
    const totalMt = (acres / ACRES_PER_HECTARE) * yieldRate;
    return targetUom === "MT" ? totalMt : mtToBushels(totalMt, commodity);
  }
  // lbs/acre
  const totalMt = (acres * yieldRate) / LBS_PER_MT;
  return targetUom === "MT" ? totalMt : mtToBushels(totalMt, commodity);
}

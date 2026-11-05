// Carbon & environmental-data listings — the outcome catalog the bid/offer forms, cards and
// filters share. Mirrors backend/environmental.py (keep the two in sync): a non-grain listing
// stores its outcome's `label` as its commodity, and its quantity is in the outcome's `unit`.
import type { AssetClass, Bid, Offer, OutcomeType, OutcomeUnit } from "../types";

export interface OutcomeOption {
  type: OutcomeType;
  /** Stored as the listing's commodity — must match backend/environmental.py exactly. */
  label: string;
  unit: OutcomeUnit;
  assetClass: Exclude<AssetClass, "grain">;
  description: string;
}

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  grain: "Grain",
  carbon: "Carbon",
  environmental: "Environmental Data",
};

export const OUTCOME_OPTIONS: readonly OutcomeOption[] = [
  { type: "reductions_t", label: "Carbon Reductions", unit: "tCO2e", assetClass: "carbon",
    description: "Avoided emissions from changed practices, in metric tonnes CO₂e." },
  { type: "removals_t", label: "Carbon Removals", unit: "tCO2e", assetClass: "carbon",
    description: "Carbon sequestered in soil or biomass, in metric tonnes CO₂e." },
  { type: "ci_commodity_t", label: "Low-CI Commodity", unit: "MT", assetClass: "carbon",
    description: "Carbon-intensity-scored commodity, in metric tonnes." },
  { type: "water_quantity", label: "Water Savings", unit: "acre-ft", assetClass: "environmental",
    description: "Avoided agricultural water consumption, in acre-feet." },
  { type: "water_quality_n", label: "Avoided Nitrate", unit: "lbs", assetClass: "environmental",
    description: "Water quality: nitrate kept out of waterways, in pounds." },
  { type: "water_quality_p", label: "Avoided Phosphate", unit: "lbs", assetClass: "environmental",
    description: "Water quality: phosphate kept out of waterways, in pounds." },
  { type: "water_quality_tss", label: "Avoided Sediment", unit: "lbs", assetClass: "environmental",
    description: "Water quality: total suspended solids kept out of waterways, in pounds." },
  { type: "acres", label: "Field-Level Environmental Data", unit: "acres", assetClass: "environmental",
    description: "Verified field-level practice and outcome data (MRV), by enrolled acre." },
];

export const OUTCOME_LABELS: readonly string[] = OUTCOME_OPTIONS.map((o) => o.label);

export function outcomesFor(assetClass: AssetClass): OutcomeOption[] {
  return OUTCOME_OPTIONS.filter((o) => o.assetClass === assetClass);
}

export function outcomeByType(type: OutcomeType | null | undefined): OutcomeOption | undefined {
  return OUTCOME_OPTIONS.find((o) => o.type === type);
}

/** Looks an outcome up by the listing's commodity — what a contract or response summary has. */
export function outcomeByLabel(commodity: string | null | undefined): OutcomeOption | undefined {
  return OUTCOME_OPTIONS.find((o) => o.label === commodity);
}

export function isOutcomeListing(listing: { asset_class?: AssetClass; commodity?: string }): boolean {
  return (listing.asset_class != null && listing.asset_class !== "grain") || !!outcomeByLabel(listing.commodity);
}

export function assetClassOf(listing: { asset_class?: AssetClass; commodity?: string }): AssetClass {
  return listing.asset_class ?? outcomeByLabel(listing.commodity)?.assetClass ?? "grain";
}

/** The unit a bid's quantity (and price, "$/unit") is in. Acres bids keep the area unit the buyer
 * typed; outcome bids use the outcome's unit; every other grain bid is MT. */
export function bidUnit(bid: Pick<Bid, "bid_type" | "area_unit" | "commodity"> & { outcome_type?: OutcomeType | null }): string {
  const outcome = outcomeByType(bid.outcome_type) ?? outcomeByLabel(bid.commodity);
  if (outcome) return outcome.unit;
  return bid.bid_type === "acres_for_contracting" ? (bid.area_unit || "acres") : "MT";
}

/** The unit a contract's volume/price is in, from its commodity. Grain contracts are MT. */
export function contractUnit(commodity: string): string {
  return outcomeByLabel(commodity)?.unit ?? "MT";
}

/** "$/tCO2e", "$/bushel", "$/MT" — the price suffix for an offer's desired price. */
export function offerPriceUnit(offer: Pick<Offer, "uom">): string {
  return offer.uom === "bushels" ? "bushel" : offer.uom;
}

/** Selectable vintage years, newest first: two ahead (forward contracts) back to 2015, the range
 * meti-v2's Match page offered. */
export function vintageYearOptions(now = new Date()): string[] {
  const newest = now.getFullYear() + 2;
  return Array.from({ length: newest - 2015 + 1 }, (_, i) => String(newest - i));
}

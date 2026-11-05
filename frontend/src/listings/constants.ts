// Vocabulary for offers/bids (Phase 2+). Commodities are shared with onboarding; re-exported
// here so listing components have one place to import from. Attributes/practices/certifications
// are Superadmin-managed now — see useTaxonomyTerms — not static lists.
export { GRAIN_COMMODITIES } from "../onboarding/constants";

export const UOM_OPTIONS = ["bushels", "MT"] as const;

// "2025-2026" style marketing-year strings — replaces the old plain-calendar-year Crop Year.
// Three consecutive years starting last year, so a listing can be backdated a season (already
// contracted grain from last year's crop) as well as forward.
export function marketingYears(count = 4, startOffset = -1): string[] {
  const base = new Date().getFullYear() + startOffset;
  return Array.from({ length: count }, (_, i) => `${base + i}-${base + i + 1}`);
}

export const PRICE_TYPE_OPTIONS = ["fixed", "basis"] as const;

export const BID_TYPE_LABELS: Record<string, string> = {
  available_grain: "Available Grain",
  acres_for_contracting: "Acres for Contracting",
  volumes_for_contracting: "Volumes for Contracting",
  environmental_outcome: "Carbon / Environmental Outcome",
};

// GAFTA/FOSFA-style dispute categories (see contracts_routes.py's DISPUTE_CATEGORIES). Quality/
// condition disputes route to independent expert determination; everything else to arbitration.
export const DISPUTE_CATEGORY_LABELS: Record<string, string> = {
  non_performance: "Non-Performance / Default",
  quality_condition: "Quality & Condition",
  force_majeure: "Force Majeure / Prohibition",
  demurrage_laytime: "Demurrage / Laytime",
  price_damages: "Price / Damages Calculation",
  other: "Other",
};

// Commodity variety/class — a real trade distinction (milling/feed suitability), not just a
// label. Keyed by the GRAIN_COMMODITIES value; a commodity with no entry here has no variety
// picker (none of these apply, e.g. an unclassed/no-variety listing).
export const COMMODITY_VARIETIES: Record<string, readonly string[]> = {
  Wheat: [
    "Hard Red Winter (HRW)", "Hard Red Spring (HRS)", "Soft Red Winter (SRW)",
    "Hard White (HW)", "Soft White (SW)", "Durum", "Mixed / Unclassed",
  ],
  Corn: [
    "Yellow Dent #2", "White Corn", "Waxy Corn", "High-Oil Corn", "Food-Grade / IP Corn", "High-Amylose",
  ],
  Soybeans: [
    "Yellow Soybean #1/#2", "Black Soybean", "Food-Grade / IP Soybeans",
  ],
  Sorghum: [
    "White Food-Grade", "Red / Bronze", "Low-Tannin", "High-Tannin", "Waxy",
  ],
};

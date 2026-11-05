// Activity / methodology taxonomy — the same codes and human labels the METI Conflicts page uses
// (source_activity_taxonomy enums). Grouped for display; values are the enum codes stored in the DB.

export interface TaxItem {
  id: string;
  label: string;
}
export interface TaxGroup {
  group: string;
  items: TaxItem[];
}

export const CARBON_POOLS: TaxGroup[] = [
  {
    group: "Above-ground biomass",
    items: [
      { id: "AGB_WOODY", label: "Woody — trees, shrubs" },
      { id: "AGB_HERBACEOUS", label: "Herbaceous / ground cover" },
    ],
  },
  { group: "Below-ground biomass", items: [{ id: "BGB_ROOTS", label: "Roots" }] },
  {
    group: "Dead organic matter",
    items: [
      { id: "DOM_DEAD_WOOD", label: "Dead wood" },
      { id: "DOM_LITTER", label: "Litter" },
    ],
  },
  {
    group: "Soil organic carbon",
    items: [
      { id: "SOC_MINERAL", label: "Mineral" },
      { id: "SOC_ORGANIC_PEAT", label: "Organic / peat" },
    ],
  },
  { group: "Soil inorganic carbon", items: [{ id: "SIC_INORGANIC", label: "Inorganic" }] },
  {
    group: "Harvested wood products",
    items: [
      { id: "HWP_IN_USE", label: "In use" },
      { id: "HWP_IN_LANDFILL", label: "In landfill" },
    ],
  },
];

export const EMISSION_SOURCES: TaxGroup[] = [
  {
    group: "Biomass burning",
    items: [
      { id: "BIOMASS_BURNING_WILDFIRE", label: "Wildfire / prescribed" },
      { id: "BIOMASS_BURNING_CROP_RESIDUE", label: "Crop residue" },
    ],
  },
  {
    group: "Managed-soil inputs",
    items: [
      { id: "SOIL_SYNTHETIC_N_FERTILIZER", label: "Synthetic N fertilizer" },
      { id: "SOIL_ORGANIC_AMENDMENT", label: "Organic amendments / manure" },
      { id: "SOIL_LIME_UREA", label: "Lime & urea" },
      { id: "SOIL_DRAINED_ORGANIC", label: "Drained organic soils" },
      { id: "SOIL_TILLAGE", label: "Tillage" },
      { id: "SOIL_INDIRECT_LEACHING", label: "Indirect leaching / runoff" },
    ],
  },
  {
    group: "Livestock",
    items: [
      { id: "LIVESTOCK_ENTERIC_FERMENTATION", label: "Enteric fermentation" },
      { id: "LIVESTOCK_MANURE_MANAGEMENT", label: "Manure management" },
    ],
  },
];

export const CREDIT_CHARACTER: TaxItem[] = [
  { id: "REDUCTION", label: "Reduction" },
  { id: "REMOVAL", label: "Removal" },
  { id: "AVOIDANCE", label: "Avoidance" },
  { id: "SEQUESTRATION", label: "Sequestration" },
];

export const ADDITIONALITY: TaxItem[] = [
  { id: "ESTABLISHED", label: "Established" },
  { id: "NOT_ESTABLISHED", label: "Not established" },
  { id: "NOT_APPLICABLE", label: "Not applicable" },
];

export const STRATA: TaxItem[] = [
  { id: "FOREST", label: "Forest" },
  { id: "WETLAND", label: "Wetland" },
  { id: "CROPLAND", label: "Cropland" },
  { id: "GRASSLAND", label: "Grassland" },
  { id: "URBAN_BUILT", label: "Urban / built" },
  { id: "OTHER", label: "Other" },
];

// code -> label, for rendering stored values anywhere.
export const TAX_LABEL: Record<string, string> = Object.fromEntries([
  ...CARBON_POOLS.flatMap((g) => g.items),
  ...EMISSION_SOURCES.flatMap((g) => g.items),
  ...CREDIT_CHARACTER,
  ...ADDITIONALITY,
  ...STRATA,
].map((i) => [i.id, i.label]));

export const taxLabel = (code: string): string => TAX_LABEL[code] ?? code;

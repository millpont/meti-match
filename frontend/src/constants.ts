import type { OutcomeField } from "./types";

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
] as const;

export const REGIONS = ["N", "S", "E", "W", "NE", "NW", "SE", "SW", "C"] as const;

// Destination country for a bid/RFQ (frontend/src/buyer/CreateRfqForm.tsx,
// frontend/src/listings/BidBrowseTable.tsx) — a fixed dropdown instead of free text, same
// pattern as US_STATES.
export const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Angola", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahrain", "Bangladesh", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso",
  "Burundi", "Cambodia", "Cameroon", "Canada", "Cape Verde", "Central African Republic", "Chad",
  "Chile", "China", "Colombia", "Comoros", "Costa Rica", "Croatia", "Cuba", "Cyprus",
  "Czech Republic", "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominican Republic",
  "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Ethiopia", "Fiji",
  "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Guatemala",
  "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India",
  "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan",
  "Jordan", "Kazakhstan", "Kenya", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho",
  "Liberia", "Libya", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives",
  "Mali", "Malta", "Mauritania", "Mauritius", "Mexico", "Moldova", "Mongolia", "Montenegro",
  "Morocco", "Mozambique", "Myanmar", "Namibia", "Nepal", "Netherlands", "New Zealand",
  "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan",
  "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar",
  "Republic of the Congo", "Romania", "Russia", "Rwanda", "Saudi Arabia", "Senegal", "Serbia",
  "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Somalia", "South Africa", "South Korea",
  "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Togo", "Trinidad and Tobago", "Tunisia",
  "Turkey", "Turkmenistan", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom",
  "United States", "Uruguay", "Uzbekistan", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
] as const;

export const COMMODITY_GROUPS: { label: string; items: string[] }[] = [
  // POC focus — corn, sorghum, and barley, with the
  // taxonomy structured to accommodate additional grains.
  { label: "Focus Grains", items: ["Corn/Maize", "Sorghum", "Barley"] },
  { label: "Other Grains & Cereals", items: ["Wheat", "Rice", "Oats", "Rye"] },
  { label: "Oilseeds", items: ["Soybeans", "Canola/Rapeseed", "Sunflower", "Cotton"] },
  { label: "Other", items: ["Sugar Beets", "Sugarcane", "Alfalfa/Hay", "None"] },
];

export const YEARS = Array.from({ length: 16 }, (_, i) => String(2015 + i));

export interface OutcomeMeta {
  field: OutcomeField;
  label: string;
  unit: string;
  asset: "Carbon" | "Water" | "Acres";
}

export const OUTCOMES: OutcomeMeta[] = [
  { field: "ci_commodity_t", label: "CI-Scored Commodity", unit: "metric tonnes", asset: "Carbon" },
  { field: "reductions_t", label: "Reductions", unit: "mt CO₂e", asset: "Carbon" },
  { field: "removals_t", label: "Removals", unit: "mt CO₂e", asset: "Carbon" },
  { field: "water_quantity", label: "Water Quantity", unit: "acre-feet", asset: "Water" },
  { field: "water_quality_n", label: "Water Quality — Nitrate", unit: "lbs N", asset: "Water" },
  { field: "water_quality_p", label: "Water Quality — Phosphate", unit: "lbs P", asset: "Water" },
  { field: "water_quality_tss", label: "Water Quality — TSS", unit: "lbs TSS", asset: "Water" },
  { field: "acres", label: "Acres", unit: "acres", asset: "Acres" },
];

export const PRICING_INFLUENCES = [
  "Lower Data Requirements", "Higher Data Requirements", "Includes Carbon", "Includes Biodiversity",
  "Includes Water", "Single Year", "Multi Year", "Geography", "Traceability", "Standards / Certifications",
];

export const PRACTICES = [
  "Reduced Till", "No Till", "Cover Crops", "Nutrient Management", "Rotational Grazing",
  "Adaptive Multi-Paddock Grazing", "Prescribed Grazing", "Riparian Buffers", "Grassed Waterways",
  "Variable Rate Technology", "Integrated Pest Management", "Crop Rotation", "Conservation Easement",
  "Wetland Restoration",
];

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending approval",
  "in-communication": "In Communication",
  "in-negotiation": "In Negotiation",
  "deal-made": "Match",
  declined: "Rejected",
};

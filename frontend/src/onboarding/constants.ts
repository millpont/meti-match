// Vocabulary for the METI Match — distinct from the legacy carbon/water taxonomy in
// ../constants.ts, which belongs to the old open_match feature.
//
// Attributes/Practices/Certifications used to live here as hardcoded string arrays; they're now
// a Superadmin-managed table (see taxonomy_routes.py, useTaxonomyTerms) so each term can carry a
// real definition shown as a hover tooltip. Commodities stay static — not something Superadmin
// needs to add to at runtime.

// Soybeans and Wheat are hidden for now — some clients would see them as competitive. Existing
// rows with those values still render; they just can't be picked. Mirrors the backend's
// production_data_routes.VISIBLE_COMMODITIES.
export const GRAIN_COMMODITIES = ["Corn", "Sorghum", "Barley"] as const;

export const ACCOUNT_ROLE_LABELS: Record<string, string> = {
  grower: "Grower", program_operator: "Program Operator",
  international_buyer: "Buyer", service_provider: "Service Provider", admin: "Admin",
};

/** What registration calls the organization being created or joined: a Program Operator signs up
 * a *program*, everyone else a company. */
export function orgNoun(role: string | null | undefined): "program" | "company" {
  return role === "program_operator" ? "program" : "company";
}

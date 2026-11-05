// Domain types — kept in lockstep with the Flask API JSON.

export type AccountType = "buyer" | "seller";

export type OutcomeField =
  | "ci_commodity_t"
  | "reductions_t"
  | "removals_t"
  | "water_quantity"
  | "water_quality_n"
  | "water_quality_p"
  | "water_quality_tss"
  | "acres";

export type MatchStatus = "pending" | "in-communication" | "in-negotiation" | "deal-made" | "declined";

export interface OutcomePrice {
  floor: number | null;
  ceiling: number | null;
}

export type OutcomePricing = Partial<Record<OutcomeField, OutcomePrice>>;

export interface Practices {
  selected: string[];
  other: string | null;
}

/** A deal row as returned by GET /api/deals. Outcome fields are numbers or null. */
export type Deal = {
  id: string;
  created_by: string;
  account_type: AccountType;
  country: string;
  state: string[];
  region: string[];
  commodity: string[];
  year: string[];
  outcome_pricing: OutcomePricing | null;
  practices: Practices | null;
  additional_data: string[] | null;
  carbon_pools: string[];
  emission_sources: string[];
  credit_character: string[];
  additionality: string | null;
  stratum: string | null;
  is_approved: boolean;
  matches: string[];
  match_statuses: Partial<Record<string, MatchStatus>>;
  created_at: string | null;
  is_own: boolean;
  match_count: number;
  user_expressed_interest: boolean;
} & Record<OutcomeField, number | null>;

export interface MatchParty {
  name: string;
  status: MatchStatus | null;
}

/** A deal enriched for the Matches tab. */
export interface MatchDeal extends Deal {
  is_creator: boolean;
  parties: Record<string, MatchParty>;
}

/** A suggested counterparty from the matching engine. */
export type SuggestedMatch = {
  id: string;
  account_type: AccountType;
  states: string[];
  commodities: string[];
  years: string[];
  carbon_pools: string[];
  emission_sources: string[];
  board: "offer" | "bid";
} & Record<OutcomeField, number | null>;

export type AccountRole =
  | "grower"
  | "program_operator"
  | "international_buyer"
  | "service_provider"
  | "admin";

// -------------------------------------------------------------------- onboarding

/** Account setup is one shared step regardless of role: name, company/organization name, the
 * last 4 digits of the company's EIN, phone, and email. Nothing role-specific is asked here —
 * see onboarding_routes.py for why (nothing else is read anywhere besides its own display, so a
 * grower/buyer/operator just fills it in later via their own listings/requirements/profile). */
export interface AccountSetupDraft {
  name: string;
  company: string;
  phone: string;
  email: string;
  /** Service Provider signup only — opts in to trading on behalf of international buyers. */
  is_trader?: boolean;
}

// -------------------------------------------------------------------- listings (Phase 2+)

export type OfferStatus = "draft" | "published" | "accepted" | "withdrawn";
export type Uom = "bushels" | "MT";
export type PriceType = "fixed" | "basis";

/** Shared by an offer's grower_approval_status and a bid's buyer_approval_status — the same
 * on-behalf-of + approval gate, just for the two different roles that can be represented. */
export type ApprovalStatus = "not_required" | "pending" | "approved" | "declined";

export interface Offer {
  id: string;
  created_by: string;
  /** Present only on the browse listing (GET /api/offers) — batch-fetched for ProfileLink. */
  created_by_name?: string | null;
  /** Set when a program operator lists this on an enrolled grower's behalf instead of their own
   * grain — null otherwise. Approval is gated by grower_approval_status. */
  on_behalf_of_grower_account_id: string | null;
  grower_approval_status: ApprovalStatus;
  /** Present on the operator's own /api/offers/mine (their on-behalf listings, enriched). */
  on_behalf_of_grower_name?: string | null;
  /** Present on a grower's /api/offers/pending-approval (whose operator this is). */
  operator_name?: string | null;
  commodity: string;
  variety: string | null;
  marketing_year: string | null;
  /** How the quantity is specified — 'grain' (Total Volume, as today) or 'acres' (Acres +
   * Yield rate; expected_volume is then computed server-side). Independent of listing_timing. */
  quantity_basis: QuantityBasis;
  /** When it's ready — 'available' (in hand now) or 'future' (not yet harvested/projected).
   * Independent of quantity_basis; drives whether delivery_window_start/end is required. */
  listing_timing: ListingTiming;
  /** When the grower expects to deliver — distinct from harvest_start/end (the grower's own
   * harvest timing estimate). Mirrors bids.delivery_window_start/end. */
  delivery_window_start: string | null;
  delivery_window_end: string | null;
  expected_volume: number | null;
  uom: Uom;
  acres_offered: number | null;
  /** Display-only — the value the grower originally typed acres_offered in. acres_offered
   * itself is always normalized to acres. Null unless quantity_basis is 'acres'. */
  area_unit: AreaUnit | null;
  yield_rate: number | null;
  yield_unit: QuantityYieldUnit | null;
  price_type: PriceType | null;
  desired_price: number | null;
  protein_pct: number | null;
  moisture_pct_max: number | null;
  test_weight: number | null;
  /** Broken Corn and Foreign Material — defaults to 3% server-side but is editable. */
  bcfm_pct: number | null;
  seed_variety: SeedVariety | null;
  /** Sorghum-specific — null/unused for every other commodity. */
  tannin_level_max: number | null;
  non_tannin_sorghum: boolean;
  /** Sorghum-specific — Broken Kernels and Foreign Material, distinct from the generic bcfm_pct. */
  bnfm_pct: number | null;
  min_order: number | null;
  harvest_start: string | null;
  harvest_end: string | null;
  sustainability_attributes: string[];
  specialty_attributes: string[];
  /** One offer can span multiple states, each with its own chosen counties — see
   * migrations/0031_locations.sql. */
  locations: OfferLocation[];
  certifications: string[];
  status: OfferStatus;
  created_at: string;
  updated_at: string;
  production: ResolvedProduction;
  has_active_negotiation: boolean;
  /** How much of this offer hasn't already gone into an accepted response's contract — several
   * buyers can each fulfill part of it over time. Same units as expected_volume/uom. */
  remaining_volume: number | null;
  /** Set on an aggregated program-operator listing: the enrolled growers whose grain is pooled
   * into it, and how much each contributed (in this offer's uom). Empty otherwise. */
  aggregate_growers: { grower_account_id: string; grower_name: string | null; contributed_volume: number | null }[];
}

export type QuantityBasis = "grain" | "acres";
export type ListingTiming = "available" | "future";
export type AreaUnit = "acres" | "hectares";
export type QuantityYieldUnit = "bu/acre" | "MT/hectare" | "lbs/acre";
export type SeedVariety = "GM" | "Non-GM";

export interface OfferLocation {
  state: string;
  counties: string[];
}

export interface CountyOption {
  name: string;
  state: string;
}

export interface OfferDraft extends ProductionOverrideDraft {
  commodity: string;
  variety: string;
  marketing_year: string;
  quantity_basis: QuantityBasis;
  listing_timing: ListingTiming;
  delivery_window_start: string;
  delivery_window_end: string;
  expected_volume: string;
  uom: Uom;
  acres_offered: string;
  area_unit: AreaUnit;
  yield_rate: string;
  yield_unit: QuantityYieldUnit | "";
  price_type: PriceType | "";
  desired_price: string;
  protein_pct: string;
  moisture_pct_max: string;
  test_weight: string;
  bcfm_pct: string;
  seed_variety: SeedVariety | "";
  tannin_level_max: string;
  non_tannin_sorghum: boolean;
  bnfm_pct: string;
  min_order: string;
  harvest_start: string;
  harvest_end: string;
  sustainability_attributes: string[];
  specialty_attributes: string[];
  locations: OfferLocation[];
  certifications: string[];
  status?: OfferStatus;
  /** Operator-only: list this offer attributed to one of their actively-enrolled growers
   * instead of their own grain. Empty string = their own grain. */
  on_behalf_of_grower_account_id?: string;
  /** Program operator aggregated listing — see Offer.aggregate_growers. */
  aggregate_growers?: { grower_account_id: string; contributed_volume: string }[];
}

/** An operator's actively-enrolled grower, for the on-behalf-of picker in OfferForm — see
 * GET /api/enrollments/active-growers. */
export interface EnrolledGrowerOption {
  grower_account_id: string;
  grower_name: string | null;
  acres_enrolled: number | null;
  /** null = no acres_enrolled on file, so nothing to cap against. */
  acres_remaining: number | null;
}

// -------------------------------------------------------------------- grower inventory

/** A farm-level cap on total volume for one commodity/marketing year, drawn down by both the
 * grower's own Offers and their accepted/in-flight bid-responses — see
 * migrations/0030_grower_inventory.sql and backend/inventory_routes.py. */
export interface GrowerInventoryRow {
  id: string;
  account_id: string;
  grower_name?: string | null;
  commodity: string;
  marketing_year: string;
  /** Which pool this row is — grain (volume) or acres, each tracked independently per
   * commodity/marketing_year (see migrations/0033_acres_inventory.sql). */
  quantity_basis: QuantityBasis;
  total_volume: number | null;
  uom: Uom | null;
  remaining_volume: number | null;
  total_acres: number | null;
  area_unit: AreaUnit | null;
  remaining_acres: number | null;
  created_at: string;
  updated_at: string;
}

export type BidType = "available_grain" | "acres_for_contracting" | "volumes_for_contracting";

export interface Bid {
  id: string;
  created_by: string;
  /** Present only on the browse listing (GET /api/bids) — batch-fetched for ProfileLink. */
  created_by_name?: string | null;
  /** Set when a service provider (Trader) places this on a represented buyer's behalf instead
   * of a buyer creating their own — null otherwise. Approval is gated by buyer_approval_status. */
  on_behalf_of_buyer_account_id: string | null;
  buyer_approval_status: ApprovalStatus;
  /** Present on the trader's own /api/bids/mine (their on-behalf listings, enriched). */
  on_behalf_of_buyer_name?: string | null;
  /** Present on a buyer's /api/bids/pending-approval (whose service provider this is). */
  service_provider_name?: string | null;
  commodity: string;
  variety: string | null;
  bid_type: BidType;
  quantity: number | null;
  /** Display-only — quantity itself is always normalized to acres, same convention as
   * offers.area_unit/acres_offered. Only meaningful when bid_type is acres_for_contracting. */
  area_unit: AreaUnit | null;
  bid_price_usd_per_mt: number | null;
  delivery_window_start: string | null;
  delivery_window_end: string | null;
  required_attributes: string[];
  required_practices: string[];
  required_certifications: string[];
  /** Stored/displayed only — deliberately not scored in matching yet (see taxonomy_routes.py's
   * "future vision" framing). */
  required_data_requirements: string[];
  /** Free-text qualification per selected attribute label, e.g. { "Water efficient": "Must use
   * drip irrigation technologies" }. */
  required_attribute_notes: Record<string, string>;
  /** If false, a response to this bid must offer the full quantity — no partial amount. */
  allow_partial: boolean;
  destination_country: string | null;
  /** draft = saved but not on the Marketplace yet (e.g. awaiting business verification). */
  status: "draft" | "open" | "closed";
  created_at: string;
  updated_at: string;
  has_active_negotiation: boolean;
  /** How much of this bid hasn't already gone into an accepted response's contract — several
   * growers (or one, more than once) can each fulfill part of it over time. */
  remaining_quantity: number | null;
}

export interface BidFilters {
  commodities?: string[];
  bidTypes?: string[];
  attributes?: string[];
  destinationCountries?: string[];
  quantityMin?: string;
  quantityMax?: string;
  /** Account ids (not names — names aren't unique). Matches the buyer a trader bid on behalf of,
   * not the trader. Lets the Directory deep-link into "just this organization's listings". */
  organizations?: string[];
}

export interface OfferFilters {
  commodities?: string[];
  states?: string[];
  certifications?: string[];
  attributes?: string[];
  practices?: string[];
  quantityMin?: string;
  quantityMax?: string;
  quantityBasis?: QuantityBasis;
  /** Account ids. Matches the grower an operator listed on behalf of, not the operator. */
  organizations?: string[];
}

export type ResponseStatus = "pending" | "in-communication" | "in-negotiation" | "accepted" | "declined";

export interface ListingResponse {
  id: string;
  listing_type: "offer" | "bid";
  listing_id: string;
  responder_account_id: string;
  /** Only populated on responses to my own listings (api.myResponses()'s to_my_listings) —
   * never leaked on a response I made against someone else's listing. */
  responder_name?: string | null;
  proposed_price: number | null;
  proposed_volume: number | null;
  /** Set only when a grower responded to a buyer's bid with an amount — which Grower Inventory
   * marketing-year bucket the amount draws from. Null otherwise. */
  marketing_year: string | null;
  status: ResponseStatus;
  match_score: number | null;
  created_at: string;
  updated_at: string;
  listing_summary: { commodity: string; variety?: string | null; quantity: number | null; uom?: string } | null;
  /** The other side of this response from the viewer's perspective — the responder on my own
   * listing, or the listing's owner on a response I made. person_name is only what's public. */
  counterparty: { account_id: string; organization_name: string | null; person_name: string | null; role: AccountRole | null } | null;
  last_message: { body: string; created_at: string; is_mine: boolean } | null;
  message_count: number;
  /** A new request on my listing nobody's acted on, or a live thread whose latest message is
   * from the other side. */
  awaiting_my_reply: boolean;
}

export interface BuyerRequirements {
  account_id: string;
  volumes_min: number | null;
  volumes_max: number | null;
  commodities: string[];
  attributes: string[];
  practices: string[];
  traceability_required: boolean;
  certification_required: string[];
  production_data_required: boolean;
}

// -------------------------------------------------------------------- matching (Phase 5)

export interface MatchRationale {
  commodity_variety_match: { variety_matched: boolean; points: number };
  delivery_window_overlap: { overlap_pct: number; known: boolean; points: number };
  quality_attribute_match: { covered_pct: number; points: number };
  counterparty_reliability: { points: number; completed_contracts: number; on_time_rate: number | null };
}

export interface MatchCandidate {
  candidate_id: string;
  candidate_type: "offer" | "bid";
  created_by: string;
  commodity: string;
  variety: string | null;
  match_score: number;
  rationale: MatchRationale;
  quantity?: number | null;
  bid_price_usd_per_mt?: number | null;
  /** My own listing's implied total $ value at this bid's $/MT price — lets a bushels/acres-
   * basis offer compare against a buyer's price on equal footing. Only present when
   * candidate_type is "bid". */
  implied_total_value_usd?: number | null;
  expected_volume?: number | null;
  uom?: Uom | null;
  desired_price?: number | null;
  /** expected_volume converted to MT — only present when candidate_type is "offer". */
  mt_equivalent?: number | null;
}

// -------------------------------------------------------------------- contracts + production data (Phase 6)

export type ContractStatus = "pending" | "shipped" | "completed";

export interface Contract {
  id: string;
  response_id: string;
  seller_account_id: string;
  buyer_account_id: string;
  seller_name: string | null;
  buyer_name: string | null;
  counterparty_name: string | null;
  commodity: string;
  variety: string | null;
  final_volume: number | null;
  final_price_usd_per_mt: number | null;
  delivery_window_start: string | null;
  delivery_window_end: string | null;
  status: ContractStatus;
  has_open_dispute: boolean;
  created_at: string;
  updated_at: string;
}

export type IrrigationType = "dryland" | "rainfed" | "irrigated";
export type YieldUnit = "bu/acre" | "MT/acre";

/** One commodity's practice defaults (production_data is keyed per grower per commodity, not
 * one flat record per grower — a corn-and-soybean grower keeps separate entries). */
export type ManureType = "dairy" | "beef" | "swine" | "poultry";

/** USDA Feedstock Carbon Intensity Calculator (FD-CIC) advanced production criteria — scoped to
 * the Production Data page only, no offer-side override_* mirrors. See
 * migrations/0048_production_data_usda_fdcic.sql. */
export interface FdCicFields {
  nitrogen_lbs_per_acre: number | null;
  nitrification_inhibitor_fraction: number | null;
  synthetic_phosphorus_lbs_per_acre: number | null;
  synthetic_potassium_lbs_per_acre: number | null;
  lime_dolomite_lbs_per_acre: number | null;
  herbicide_lbs_per_acre: number | null;
  insecticide_lbs_per_acre: number | null;
  fungicide_lbs_per_acre: number | null;
  manure_lbs_per_acre: number | null;
  manure_type: ManureType | null;
  tdisc_score: number | null;
  diesel_gal_per_acre: number | null;
  gasoline_gal_per_acre: number | null;
  natural_gas_total_therms: number | null;
  lpg_total_gallons: number | null;
  electricity_kwh_per_acre: number | null;
}

export interface ProductionDataEntry extends FdCicFields {
  commodity: string;
  advanced_completion_pct: number;
  actual_yield_per_acre: number | null;
  yield_unit: YieldUnit | null;
  irrigation_type: IrrigationType | null;
  crop_rotation_years: number | null;
  crop_rotation_crops: number | null;
  soil_test_on_file: boolean;
  third_party_verified: boolean;
  input_usage_notes: string | null;
  conservation_practices: string[];
  sustainability_attributes: string[];
  specialty_attributes: string[];
  has_verification_document: boolean;
  verification_document_url: string | null;
  has_soil_test_document: boolean;
  soil_test_document_url: string | null;
  /** The marketing year this entry reflects — "any" means the fallback default (see
   * migrations/0047_production_data_per_year.sql), not a literal year. */
  marketing_year: string;
  /** True when no row exists for the requested marketing_year and this is the "any" fallback
   * shown instead. */
  is_fallback_to_any_year: boolean;
  /** Every specific (non-"any") marketing year this commodity has its own saved row for. */
  saved_years: string[];
  /** Whether this commodity+year's FdCicFields are shown on listings (see
   * migrations/0051_production_data_show_advanced.sql) — private by default. */
  show_advanced_in_listing: boolean;
}

export interface ProductionDataOverview {
  commodities: ProductionDataEntry[];
}

export interface ProductionDataDraft {
  marketing_year: string;
  actual_yield_per_acre: string;
  yield_unit: YieldUnit | "";
  irrigation_type: IrrigationType | "";
  crop_rotation_years: string;
  crop_rotation_crops: string;
  soil_test_on_file: boolean;
  third_party_verified: boolean;
  input_usage_notes: string;
  conservation_practices: string[];
  sustainability_attributes: string[];
  specialty_attributes: string[];
  manure_type: ManureType | "";
  show_advanced_in_listing: boolean;
  nitrogen_lbs_per_acre: string;
  nitrification_inhibitor_fraction: string;
  synthetic_phosphorus_lbs_per_acre: string;
  synthetic_potassium_lbs_per_acre: string;
  lime_dolomite_lbs_per_acre: string;
  herbicide_lbs_per_acre: string;
  insecticide_lbs_per_acre: string;
  fungicide_lbs_per_acre: string;
  manure_lbs_per_acre: string;
  tdisc_score: string;
  diesel_gal_per_acre: string;
  gasoline_gal_per_acre: string;
  natural_gas_total_therms: string;
  lpg_total_gallons: string;
  electricity_kwh_per_acre: string;
}

/** An offer's resolved production info — its own override_* fields merged with its grower's
 * per-commodity production_data default. Computed server-side (offers_routes.py) since a buyer
 * can't otherwise see another account's production_data. */
export interface ResolvedProduction extends Partial<FdCicFields> {
  actual_yield_per_acre: number | null;
  yield_unit: YieldUnit | null;
  irrigation_type: IrrigationType | null;
  crop_rotation_years: number | null;
  crop_rotation_crops: number | null;
  soil_test_on_file: boolean;
  third_party_verified: boolean;
  input_usage_notes: string | null;
  conservation_practices: string[];
  has_override: boolean;
  has_default: boolean;
  has_verification_document: boolean;
  verification_document_url: string | null;
  has_soil_test_document: boolean;
  soil_test_document_url: string | null;
  /** Whether the grower opted their commodity+year defaults into being shown on listings (see
   * migrations/0051_production_data_show_advanced.sql) — when false, every FdCicFields field
   * above is null even if the grower has actually filled them out privately. */
  show_advanced_in_listing: boolean;
}

export type OfferDocumentCategory = "general" | "certification";

/** One row of the open-ended, labeled multi-document upload on an offer (Phase 11) — additive
 * alongside ResolvedProduction's 2 fixed verification/soil-test document fields above, which stay
 * as-is. See migrations/0046_offer_documents.sql. */
export interface OfferDocument {
  id: string;
  offer_id: string;
  uploaded_by_account_id: string;
  label: string;
  category: OfferDocumentCategory;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
  url: string | null;
}

export type ProductionDataDocumentCategory = "grower" | "certification";

/** One row of the open-ended, labeled multi-document upload on a Production Data commodity
 * default — additive alongside ProductionDataEntry's 2 fixed verification/soil-test document
 * fields, which stay as-is. See migrations/0052_production_data_documents.sql. */
export interface ProductionDataDocument {
  id: string;
  account_id: string;
  commodity: string;
  label: string;
  category: ProductionDataDocumentCategory;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
  url: string | null;
}

/** Draft shape for the optional "override this listing's production data" section of
 * OfferForm — empty string / null means "don't override, inherit the commodity default". */
export interface ProductionOverrideDraft {
  override_actual_yield_per_acre: string;
  override_yield_unit: YieldUnit | "";
  override_irrigation_type: IrrigationType | "";
  override_crop_rotation_years: string;
  override_crop_rotation_crops: string;
  override_soil_test_on_file: boolean | null;
  override_third_party_verified: boolean | null;
  override_input_usage_notes: string;
  /** null = inherit the commodity default; an array (even empty) = this listing's own value. */
  override_conservation_practices: string[] | null;
}

// -------------------------------------------------------------------- taxonomy (Superadmin-managed)

/** The three vocabulary families Superadmin manages — see taxonomy_routes.py. Every offer/bid/
 * requirements picker that used to be a hardcoded string array now loads its options (and each
 * one's hover-tooltip definition) from here. */
export type TaxonomyTermType = "attribute" | "practice" | "certification" | "data_requirement" | "service_category";

export type AttributeSegment = "specialty" | "sustainability";

export interface TaxonomyTerm {
  id: string;
  type: TaxonomyTermType;
  label: string;
  definition: string | null;
  /** Only meaningful when type === "attribute" — see migrations/0045_taxonomy_attribute_segment.sql. */
  segment: AttributeSegment | null;
}

// -------------------------------------------------------------------- admin (Phase 7)

export interface AdminStat {
  value: number;
  pct_change: number | null;
}

/** Same shape as AdminDashboard's stats, but scoped to the caller's own contracts — every
 * non-admin role's Home tab shows this instead of marketplace-wide numbers. */
export interface MyStats {
  total_volume_mt: AdminStat;
  gmv_usd: AdminStat;
  total_transactions: AdminStat;
  active_counterparties: AdminStat;
}

export interface AdminDashboard {
  stats: {
    total_volume_mt: AdminStat;
    gmv_usd: AdminStat;
    total_transactions: AdminStat;
    active_buyers: AdminStat;
    active_sellers: AdminStat;
  };
  volume_by_state: { state: string; volume: number }[];
  recent_transactions: {
    id: string; commodity: string; variety: string | null; final_volume: number | null;
    final_price_usd_per_mt: number | null; seller_name: string | null; buyer_name: string | null;
    status: ContractStatus; created_at: string;
  }[];
}

export interface AdminAccount {
  id: string;
  role: AccountRole;
  name: string;
  email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  ein_last4: string | null;
  created_at: string;
  frozen: boolean;
  frozen_reason: string | null;
  role_switching_enabled: boolean;
  /** Always "approved" unless superadmin approval of new accounts is turned on — see
   * migrations/0053_account_approval_status.sql. */
  approval_status: AccountApprovalStatus;
  approval_note: string | null;
}

export interface AdminListing {
  id: string;
  listing_type: "offer" | "bid";
  created_by_name: string | null;
  commodity: string;
  variety: string | null;
  quantity: number | null;
  uom: string;
  status: string;
  created_at: string;
}

export type DisputeStatus = "open" | "resolved";

/** See contracts_routes.py's DISPUTE_CATEGORIES — modeled on GAFTA/FOSFA international grain
 * arbitration rules: quality/condition disputes go to independent expert determination rather
 * than arbitration, everything else goes to arbitration. */
export type DisputeCategory =
  | "non_performance"
  | "quality_condition"
  | "force_majeure"
  | "demurrage_laytime"
  | "price_damages"
  | "other";

export type DisputeResolutionTrack = "arbitration" | "expert_determination";
export type DisputeTier = "tribunal" | "board_of_appeal";

export interface Dispute {
  id: string;
  contract_id: string;
  contract_summary: string;
  raised_by_name: string | null;
  reason: string;
  description: string | null;
  status: DisputeStatus;
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  category: DisputeCategory;
  resolution_track: DisputeResolutionTrack;
  tier: DisputeTier;
  filing_deadline: string | null;
  is_time_barred: boolean;
  tribunal_resolution_notes: string | null;
  appealed_at: string | null;
}

// -------------------------------------------------------------------- program enrollments (Phase 4)

/** pending = the grower asked to join; invited = the operator asked an already-registered grower
 * (only the grower can answer it). */
export type EnrollmentStatus = "active" | "pending" | "invited";

export interface Enrollment {
  id: string;
  program_operator_account_id: string;
  grower_account_id: string | null;
  grower_account_name: string | null;
  grower_name_freeform: string | null;
  grower_email: string | null;
  farms_count: number | null;
  acres_enrolled: number | null;
  primary_practices: string[];
  enrollment_date: string;
  status: EnrollmentStatus;
  created_at: string;
}

export interface ProgramOperatorOption {
  id: string;
  name: string;
}

/** A grower's own view of their (at most one) program affiliation — same row shape as
 * Enrollment, plus the operator's name for display. */
export interface ProgramAffiliation extends Enrollment {
  program_operator_name: string | null;
}

/** A registered grower who opted in to "Open to Program Enrollment" — invitable by an operator. */
export interface DiscoverableGrower {
  grower_account_id: string;
  farm_name: string | null;
  account_name: string | null;
  state: string | null;
  total_acres: number | null;
  /** Where this grower stands relative to the viewing operator — only "available" is invitable. */
  relationship: "available" | "in_your_program" | "requested_to_join" | "invited" | "in_another_program";
}

/** An operator registering a brand-new grower account on the grower's behalf. */
export interface NewGrowerDraft {
  farm_name: string;
  contact_name: string;
  email: string;
  phone: string;
  farms_count: string;
  acres_enrolled: string;
  primary_practices: string[];
}

export type BusinessIdType = "ein" | "state_registration" | "parent_state_registration" | "foreign_registration";

/** What an account still needs before it can transact — see backend/business_verification.py. */
export interface BusinessVerification {
  identifier_type: BusinessIdType | null;
  identifier_value: string | null;
  document_count: number;
  has_identifier: boolean;
  complete: boolean;
  allowed_types: { id: BusinessIdType; label: string }[];
  /** False when the server has the requirement switched off (BUSINESS_VERIFICATION_REQUIRED). */
  required: boolean;
}

export interface EnrollmentDraft {
  grower_name_freeform: string;
  grower_email: string;
  farms_count: string;
  acres_enrolled: string;
  primary_practices: string[];
  status: EnrollmentStatus;
}

export interface BuyerRequirementsDraft {
  volumes_min: string;
  volumes_max: string;
  commodities: string[];
  attributes: string[];
  practices: string[];
  traceability_required: boolean;
  certification_required: string[];
  production_data_required: boolean;
}

export interface Me {
  authenticated: boolean;
  profile?: { user_id: string; name: string; picture: string; email: string; email_verified?: boolean };
  account_id?: string | null;
  account_name?: string | null;
  /** The account owner's self-chosen personal display name (see profile editor) -- prefer this
   * over `profile.name` (the raw Auth0 login name) wherever the person's own name is shown. */
  display_name?: string | null;
  /** The role ACTIVE for this session (which dashboard renders) — null until onboarding has
   * created the account. */
  role?: AccountRole | null;
  /** Every role this account holds (see migrations/0022_multi_role_accounts.sql) — a
   * single-role account just has one entry, matching `role`. */
  roles?: AccountRole[];
  is_superadmin?: boolean;
  /** True if this login is its account's company-level admin (the first person to register
   * that company) — able to approve/decline other logins asking to join. See
   * migrations/0024_company_join_requests.sql. */
  is_company_admin?: boolean;
  /** Superadmin-controlled per-account opt-in for adding/switching roles at all — see
   * migrations/0026_role_switching_toggle.sql. RoleSwitcher renders nothing unless this is true. */
  role_switching_enabled?: boolean;
  /** Set only while `role` is null and this login has asked to join an existing company
   * instead of onboarding a new one — lets the SPA show a waiting/declined screen. */
  pending_join_request?: JoinRequest | null;
  db_unavailable?: boolean;
  frozen?: boolean;
  frozen_reason?: string | null;
  /** Whether superadmin approval of brand-new accounts is turned on at all
   * (config.ACCOUNT_APPROVAL_REQUIRED — off by default). When false, no approval UI renders
   * anywhere and `approval_status` is always "approved". */
  account_approval_required?: boolean;
  approval_status?: AccountApprovalStatus;
  /** A superadmin's optional note on the approval decision — shown on the pending/declined screen. */
  approval_note?: string | null;
  business_verification_required?: boolean;
  /** Has a business identifier + at least one company document (or the requirement is off) —
   * needed to publish or respond to a listing. */
  business_verified?: boolean;
  /** Service providers only: opted in as a Trader (bids, buyer representation, agreements).
   * Null for every other role. */
  is_trader?: boolean | null;
  /** Before onboarding: a grower account a program operator already registered for this login's
   * verified email, offered to claim instead of signing up from scratch. */
  claimable_account?: { id: string; name: string | null; operator_name: string | null } | null;
}

export type AccountApprovalStatus = "pending" | "approved" | "declined";

/** One "Company Documentation" file on an account (Articles of Incorporation, IRS Confirmation
 * Letter, …) — see migrations/0054_account_documents.sql. */
export interface AccountDocument {
  id: string;
  account_id: string;
  label: string;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
  url: string | null;
}

// -------------------------------------------------------------------- directory (Phase 12)

/** One account as shown in the marketplace Directory. Deliberately carries no contact fields. */
export interface DirectoryEntry {
  account_id: string;
  role: AccountRole;
  name: string | null;
  display_name: string | null;
  photo_url: string | null;
  bio: string | null;
  reputation: ReputationSummary;
  active_listing_count: number;
  active_offer_count: number;
  active_bid_count: number;
  /** Short human line for the card, e.g. "3 grain offers · 1 buyer listing". */
  listing_summary: string;
}

/** id + name + role for the Marketplace's Organization filter — names aren't unique, so the
 * filter's value is the account id and the name is only its label. */
export interface Organization {
  account_id: string;
  name: string | null;
  role: AccountRole;
}

// -------------------------------------------------------------------- profile (Phase 10 Pass 1)

export interface ProfileLinkEntry {
  label: string;
  url: string;
}

/** One gallery photo (e.g. of the farm) — distinct from the single avatar photo_path, since a
 * gallery has many independent photos each needing a stable id to later remove. See
 * migrations/0036_account_gallery_photos.sql. */
export interface GalleryPhoto {
  id: string;
  url: string | null;
  caption: string | null;
}

/** My own profile — GET/PUT /api/profile. Photo/bio/links/contact-visibility are account-level,
 * shared identically across all 4 roles (see migrations/0035_account_profile_fields.sql). */
export interface OwnProfile {
  account_id: string;
  role: AccountRole;
  name: string;
  display_name: string | null;
  photo_url: string | null;
  bio: string | null;
  website_url: string | null;
  links: ProfileLinkEntry[];
  gallery_photos: GalleryPhoto[];
  contact_visible: boolean;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  /** Only present when role is service_provider — see service_provider_profiles
   * (migrations/0004_grain_identity.sql, reused as-is in Phase 10 Pass 2). */
  services_offered?: string[];
  states_covered?: string[];
  is_trader?: boolean;
  /** Only present for an account holding the grower role — lets program operators find and
   * invite them (see enrollments_routes.py's discoverable_growers). */
  open_to_program_enrollment?: boolean;
}

export interface ReputationSummary {
  completed_contracts: number;
  on_time_rate: number | null;
}

/** Someone else's profile — GET /api/accounts/<id>/public-profile. Contact fields are present
 * only when that account has turned contact_visible on. */
export interface PublicProfile {
  account_id: string;
  role: AccountRole;
  name: string;
  photo_url: string | null;
  bio: string | null;
  website_url: string | null;
  links: ProfileLinkEntry[];
  gallery_photos: GalleryPhoto[];
  contact_visible: boolean;
  reputation: ReputationSummary;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  services_offered?: string[];
  states_covered?: string[];
}

// -------------------------------------------------------------------- service provider marketplace (Phase 10 Pass 2)

/** One row in the provider directory — GET /api/service-providers. */
export interface ServiceProviderListing {
  account_id: string;
  name: string;
  photo_url: string | null;
  bio: string | null;
  services_offered: string[];
  states_covered: string[];
  reputation: ReputationSummary;
}

export type ServiceRequestStatus = "pending" | "accepted" | "declined";

export interface ServiceRequest {
  id: string;
  requester_account_id: string;
  service_provider_account_id: string;
  service_category: string | null;
  message: string | null;
  status: ServiceRequestStatus;
  created_at: string;
  updated_at: string;
  requester_name?: string | null;
  service_provider_name?: string | null;
}

// -------------------------------------------------------------------- company join requests

export type JoinRequestStatus = "pending" | "approved" | "declined";

export interface JoinRequest {
  id: string;
  account_id: string;
  account_name?: string | null;
  role: AccountRole;
  status: JoinRequestStatus;
  created_at: string;
  requester_name?: string | null;
  requester_email?: string | null;
}

// -------------------------------------------------------------------- attribute requests

export interface AttributeRequest {
  id: string;
  requested_by_account_id: string;
  requested_by_name?: string | null;
  type: string;
  name: string;
  description: string | null;
  status: "pending" | "added" | "dismissed";
  created_at: string;
}

export interface CompanyOption {
  id: string;
  name: string;
  roles: AccountRole[];
}

/** A chat message within a negotiation thread. */
export interface ChatMessage {
  id: string;
  sender_account_id: string;
  sender_name: string;
  is_mine: boolean;
  body: string;
  created_at: string;
}

// -------------------------------------------------------------------- notifications

export type NotificationType =
  | "response_received"
  | "status_changed"
  | "message_received"
  | "dispute_raised"
  | "dispute_resolved"
  | "offer_approval_requested"
  | "offer_approved"
  | "offer_declined"
  | "bid_approval_requested"
  | "bid_approved"
  | "bid_declined"
  | "representation_requested"
  | "representation_approved"
  | "representation_declined"
  | "join_request_received"
  | "join_request_approved"
  | "attribute_request_received";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link_type:
    | "response" | "agreement" | "dispute" | "offer" | "bid" | "representation" | "join_request"
    | "attribute_request" | "service_request" | "enrollment" | null;
  link_id: string | null;
  read: boolean;
  created_at: string;
}

// -------------------------------------------------------------------- buyer representation (Trader)

export type RepresentationStatus = "active" | "pending";

export interface BuyerRepresentation {
  id: string;
  service_provider_account_id: string;
  buyer_account_id: string;
  status: RepresentationStatus;
  created_at: string;
  buyer_name?: string | null;
  service_provider_name?: string | null;
}

/** The payload POSTed to create/preview a deal. */
export interface DealDraft {
  account_type: AccountType;
  country: string;
  state: string[];
  region: string[];
  commodity: string[];
  year: string[];
  outcome_pricing: OutcomePricing;
  practices: Practices | null;
  additional_data: string[];
  carbon_pools: string[];
  emission_sources: string[];
  credit_character: string[];
  additionality: string | null;
  stratum: string | null;
  ci_commodity_t: string | null;
  reductions_t: string | null;
  removals_t: string | null;
  water_quantity: string | null;
  water_quality_n: string | null;
  water_quality_p: string | null;
  water_quality_tss: string | null;
  acres: string | null;
}

// Typed API client. Same-origin fetch with cookie auth + CSRF header on writes.
import type {
  AccountApprovalStatus, AccountDocument, AccountRole, BusinessVerification, DiscoverableGrower, NewGrowerDraft, AccountSetupDraft, AdminAccount, AdminDashboard, AdminListing, AreaUnit,
  AttributeRequest, AttributeSegment, Bid, BidFilters, DirectoryEntry, Organization,
  BuyerRepresentation, BuyerRequirements, BuyerRequirementsDraft, ChatMessage, CompanyOption, Contract, ContractStatus,
  CountyOption, Deal, DealDraft, Dispute, DisputeCategory, EnrolledGrowerOption, Enrollment, EnrollmentDraft,
  GrowerInventoryRow, JoinRequest, ListingResponse,
  MatchCandidate, MatchDeal, Me, MyStats, Notification, Offer, OfferDocument, OfferDocumentCategory, OfferDraft, OfferFilters, OwnProfile,
  ProductionDataDocument, ProductionDataDocumentCategory, ProductionDataDraft, ProductionDataEntry, ProductionDataOverview, ProfileLinkEntry, ProgramAffiliation,
  OutcomeListingDraft, ProgramOperatorOption, PublicProfile, QuantityBasis,
  ResponseStatus, ServiceRequest, ServiceRequestStatus, ServiceProviderListing, SuggestedMatch, MatchStatus, TaxonomyTerm, TaxonomyTermType, GrainUom,
} from "./types";

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m && m[1] ? decodeURIComponent(m[1]) : "";
}

// When hosted under a subpath (lab.millpont.com/match/), Vite sets BASE_URL to "/match/".
// API and auth URLs must carry that prefix; in dev it's just "/".
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const authUrl = (p: string) => `${BASE}/${p.replace(/^\//, "")}`;

/** An API error, carrying the server's machine-readable `code` when it sent one. */
export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/** Fired on window whenever the server refuses an action for missing business verification —
 * App listens for it and shows the "complete your profile" popup, so no individual form has to
 * know about the rule. See backend/business_verification.py. */
export const VERIFICATION_REQUIRED_EVENT = "grains:business-verification-required";

function failure(body: Record<string, unknown>, status: number): ApiError {
  const code = typeof body.code === "string" ? body.code : undefined;
  if (code === "business_verification_required") {
    window.dispatchEvent(new CustomEvent(VERIFICATION_REQUIRED_EVENT, { detail: body.error }));
  }
  return new ApiError((body.error as string) || `Request failed (${status})`, code);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers["X-CSRFToken"] = csrfToken();
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: "same-origin" });
  if (res.status === 401) {
    window.location.href = authUrl("login");
    throw new Error("unauthenticated");
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.success === false) {
    throw failure(body, res.status);
  }
  return body as T;
}

// Multipart upload — no Content-Type header (the browser sets it, with the boundary).
async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    body: form,
    headers: { "X-CSRFToken": csrfToken() },
    credentials: "same-origin",
  });
  if (res.status === 401) {
    window.location.href = authUrl("login");
    throw new Error("unauthenticated");
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.success === false) {
    throw failure(body, res.status);
  }
  return body as T;
}

type OnboardingResult = { account_id: string; role: AccountRole };

export const api = {
  me: () => request<Me>("/api/me"),

  onboardGrower: (draft: AccountSetupDraft) =>
    request<OnboardingResult>("/api/onboarding/grower", { method: "POST", body: JSON.stringify(draft) }),

  onboardOperator: (draft: AccountSetupDraft) =>
    request<OnboardingResult>("/api/onboarding/operator", { method: "POST", body: JSON.stringify(draft) }),

  onboardBuyer: (draft: AccountSetupDraft) =>
    request<OnboardingResult>("/api/onboarding/buyer", { method: "POST", body: JSON.stringify(draft) }),

  onboardServiceProvider: (draft: AccountSetupDraft) =>
    request<OnboardingResult>("/api/onboarding/service_provider", { method: "POST", body: JSON.stringify(draft) }),

  /** Take over a grower account a program operator registered for this (verified) email. */
  claimAccount: (accountId: string) =>
    request<{ account_id: string }>("/api/onboarding/claim", { method: "POST", body: JSON.stringify({ account_id: accountId }) }),

  // -------------------------------------------------------------- joining an existing company

  searchCompanies: (q: string, role?: AccountRole) =>
    request<{ companies: CompanyOption[] }>(
      `/api/onboarding/companies?q=${encodeURIComponent(q)}${role ? `&role=${role}` : ""}`,
    ),

  requestToJoinCompany: (accountId: string, role: AccountRole) =>
    request<{ success: boolean }>("/api/onboarding/join", {
      method: "POST", body: JSON.stringify({ account_id: accountId, role }),
    }),

  companyJoinRequests: () => request<{ requests: JoinRequest[] }>("/api/company/join-requests"),

  approveCompanyJoinRequest: (id: string) =>
    request<{ success: boolean }>(`/api/company/join-requests/${id}/approve`, { method: "PATCH" }),

  declineCompanyJoinRequest: (id: string) =>
    request<{ success: boolean }>(`/api/company/join-requests/${id}/decline`, { method: "PATCH" }),

  // -------------------------------------------------------------- multi-role accounts

  addRole: (role: AccountRole) =>
    request<{ role: AccountRole; roles: AccountRole[] }>("/api/roles", { method: "POST", body: JSON.stringify({ role }) }),

  switchRole: (role: AccountRole) =>
    request<{ role: AccountRole }>("/api/switch-role", { method: "POST", body: JSON.stringify({ role }) }),

  // -------------------------------------------------------------- taxonomy (Superadmin-managed)

  taxonomy: (type?: TaxonomyTermType) =>
    request<{ terms: TaxonomyTerm[] }>(`/api/taxonomy${type ? `?type=${type}` : ""}`),

  adminCreateTaxonomyTerm: (type: TaxonomyTermType, label: string, definition: string, segment?: AttributeSegment) =>
    request<{ term: TaxonomyTerm }>("/api/admin/taxonomy", {
      method: "POST", body: JSON.stringify({ type, label, definition, segment }),
    }),

  adminUpdateTaxonomyTerm: (id: string, patch: { label?: string; definition?: string; segment?: AttributeSegment }) =>
    request<{ term: TaxonomyTerm }>(`/api/admin/taxonomy/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  adminDeleteTaxonomyTerm: (id: string) =>
    request<{ success: boolean }>(`/api/admin/taxonomy/${id}`, { method: "DELETE" }),

  // -------------------------------------------------------------- attribute requests

  requestAttribute: (type: string, name: string, description?: string) =>
    request<{ success: boolean; request: AttributeRequest }>("/api/attribute-requests", {
      method: "POST", body: JSON.stringify({ type, name, description }),
    }),

  adminAttributeRequests: () => request<{ requests: AttributeRequest[] }>("/api/admin/attribute-requests"),

  adminDismissAttributeRequest: (id: string) =>
    request<{ success: boolean }>(`/api/admin/attribute-requests/${id}/dismiss`, { method: "PATCH" }),

  adminMarkAttributeRequestAdded: (id: string) =>
    request<{ success: boolean }>(`/api/admin/attribute-requests/${id}/mark-added`, { method: "PATCH" }),

  // -------------------------------------------------------------- counties (scoped to a state)

  searchCounties: (state: string, q?: string) =>
    request<{ counties: CountyOption[] }>(
      `/api/counties?state=${encodeURIComponent(state)}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    ),

  // -------------------------------------------------------------- grower inventory

  growerInventory: () => request<{ inventory: GrowerInventoryRow[] }>("/api/grower-inventory"),

  growerInventoryRemaining: (commodity: string, marketingYear: string, quantityBasis: QuantityBasis = "grain") =>
    request<{ remaining_volume: number | null; remaining_acres: number | null; uom: GrainUom | null; area_unit: AreaUnit | null }>(
      `/api/grower-inventory/remaining?commodity=${encodeURIComponent(commodity)}&marketing_year=${encodeURIComponent(marketingYear)}&quantity_basis=${quantityBasis}`,
    ),

  putGrainInventory: (commodity: string, marketingYear: string, totalVolume: string, uom: GrainUom) =>
    request<{ inventory: GrowerInventoryRow }>(
      `/api/grower-inventory/${encodeURIComponent(commodity)}/${encodeURIComponent(marketingYear)}`,
      { method: "PUT", body: JSON.stringify({ quantity_basis: "grain", total_volume: totalVolume, uom }) },
    ),

  putAcresInventory: (commodity: string, marketingYear: string, totalAcres: string, areaUnit: AreaUnit) =>
    request<{ inventory: GrowerInventoryRow }>(
      `/api/grower-inventory/${encodeURIComponent(commodity)}/${encodeURIComponent(marketingYear)}`,
      { method: "PUT", body: JSON.stringify({ quantity_basis: "acres", total_acres: totalAcres, area_unit: areaUnit }) },
    ),

  deleteGrowerInventory: (commodity: string, marketingYear: string, quantityBasis: QuantityBasis = "grain") =>
    request<{ success: boolean }>(
      `/api/grower-inventory/${encodeURIComponent(commodity)}/${encodeURIComponent(marketingYear)}?quantity_basis=${quantityBasis}`,
      { method: "DELETE" },
    ),

  growersInventoryRollup: () => request<{ growers_inventory: GrowerInventoryRow[] }>("/api/enrollments/growers-inventory"),

  // -------------------------------------------------------------- listings (Phase 2+)

  createOffer: (draft: OfferDraft) =>
    request<{ offer: Offer }>("/api/offers", { method: "POST", body: JSON.stringify(draft) }),

  myOffers: () => request<{ offers: Offer[] }>("/api/offers/mine"),

  publishOffer: (offerId: string) =>
    request<{ offer: Offer }>(`/api/offers/${offerId}/publish`, { method: "POST" }),

  withdrawOffer: (offerId: string) =>
    request<{ success: boolean }>(`/api/offers/${offerId}/withdraw`, { method: "POST" }),

  offersPendingApproval: () => request<{ offers: Offer[] }>("/api/offers/pending-approval"),

  approveOffer: (offerId: string) =>
    request<{ offer: Offer }>(`/api/offers/${offerId}/approve`, { method: "POST" }),

  declineOffer: (offerId: string) =>
    request<{ success: boolean }>(`/api/offers/${offerId}/decline`, { method: "POST" }),

  browseBids: (filters: BidFilters = {}) => {
    const p = new URLSearchParams();
    if (filters.assetClasses?.length) p.set("asset_classes", filters.assetClasses.join(","));
    if (filters.vintageYears?.length) p.set("vintage_years", filters.vintageYears.join(","));
    if (filters.commodities?.length) p.set("commodities", filters.commodities.join(","));
    if (filters.bidTypes?.length) p.set("bid_types", filters.bidTypes.join(","));
    if (filters.attributes?.length) p.set("attributes", filters.attributes.join(","));
    if (filters.destinationCountries?.length) p.set("destination_countries", filters.destinationCountries.join(","));
    if (filters.quantityMin) p.set("quantity_min", filters.quantityMin);
    if (filters.quantityMax) p.set("quantity_max", filters.quantityMax);
    if (filters.organizations?.length) p.set("organizations", filters.organizations.join(","));
    const qs = p.toString();
    return request<{ bids: Bid[] }>(`/api/bids${qs ? `?${qs}` : ""}`);
  },

  myBids: () => request<{ bids: Bid[] }>("/api/bids/mine"),

  touchBid: (bidId: string) =>
    request<{ success: boolean }>(`/api/bids/${bidId}/touch`, { method: "POST" }),

  touchOffer: (offerId: string) =>
    request<{ success: boolean }>(`/api/offers/${offerId}/touch`, { method: "POST" }),

  closeBid: (bidId: string) =>
    request<{ success: boolean }>(`/api/bids/${bidId}/close`, { method: "POST" }),

  updateOffer: (offerId: string, patch: Record<string, unknown>) =>
    request<{ offer: Offer }>(`/api/offers/${offerId}`, { method: "PATCH", body: JSON.stringify(patch) }),

  updateBid: (bidId: string, patch: Record<string, unknown>) =>
    request<{ bid: Bid }>(`/api/bids/${bidId}`, { method: "PATCH", body: JSON.stringify(patch) }),

  respondToBid: (bidId: string, opts: { matchScore?: number; proposedVolume?: string; marketingYear?: string } = {}) =>
    request<{ response: ListingResponse }>(`/api/bids/${bidId}/respond`, {
      method: "POST",
      body: JSON.stringify({
        ...(opts.matchScore != null ? { match_score: opts.matchScore } : {}),
        ...(opts.proposedVolume ? { proposed_volume: opts.proposedVolume } : {}),
        ...(opts.marketingYear ? { marketing_year: opts.marketingYear } : {}),
      }),
    }),

  myResponses: () =>
    request<{ made_by_me: ListingResponse[]; to_my_listings: ListingResponse[] }>("/api/responses"),

  updateResponseStatus: (responseId: string, status: ResponseStatus) =>
    request<{ status: ResponseStatus }>(`/api/responses/${responseId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  listResponseMessages: (responseId: string) =>
    request<{ messages: ChatMessage[] }>(`/api/responses/${responseId}/messages`),

  sendResponseMessage: (responseId: string, body: string) =>
    request<{ success: boolean }>(`/api/responses/${responseId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),

  browseOffers: (filters: OfferFilters = {}) => {
    const p = new URLSearchParams();
    if (filters.assetClasses?.length) p.set("asset_classes", filters.assetClasses.join(","));
    if (filters.vintageYears?.length) p.set("vintage_years", filters.vintageYears.join(","));
    if (filters.commodities?.length) p.set("commodities", filters.commodities.join(","));
    if (filters.states?.length) p.set("states", filters.states.join(","));
    if (filters.certifications?.length) p.set("certifications", filters.certifications.join(","));
    if (filters.attributes?.length) p.set("attributes", filters.attributes.join(","));
    if (filters.practices?.length) p.set("practices", filters.practices.join(","));
    if (filters.quantityMin) p.set("quantity_min", filters.quantityMin);
    if (filters.quantityMax) p.set("quantity_max", filters.quantityMax);
    if (filters.quantityBasis) p.set("quantity_basis", filters.quantityBasis);
    if (filters.organizations?.length) p.set("organizations", filters.organizations.join(","));
    const qs = p.toString();
    return request<{ offers: Offer[] }>(`/api/offers${qs ? `?${qs}` : ""}`);
  },

  respondToOffer: (offerId: string, opts: { matchScore?: number; proposedVolume?: string } = {}) =>
    request<{ response: ListingResponse }>(`/api/offers/${offerId}/respond`, {
      method: "POST",
      body: JSON.stringify({
        ...(opts.matchScore != null ? { match_score: opts.matchScore } : {}),
        ...(opts.proposedVolume ? { proposed_volume: opts.proposedVolume } : {}),
      }),
    }),

  matchingPreview: (listingType: "offer" | "bid", listingId: string) =>
    request<{ listing: { id: string; commodity: string }; matches: MatchCandidate[] }>(
      `/api/matching/preview?listing_type=${listingType}&listing_id=${listingId}`,
    ),

  createBid: (draft: {
    commodity: string; variety: string; bid_type: string; quantity: string; area_unit?: AreaUnit;
    bid_price_usd_per_mt: string;
    delivery_window_start: string; delivery_window_end: string; required_attributes: string[];
    required_practices: string[]; required_certifications: string[]; required_data_requirements: string[];
    required_attribute_notes: Record<string, string>; allow_partial: boolean;
    destination_country: string; on_behalf_of_buyer_account_id?: string;
    /** "draft" saves it without going live (no business verification needed). Default "open". */
    status?: "draft" | "open";
  }) => request<{ bid: Bid }>("/api/bids", { method: "POST", body: JSON.stringify(draft) }),

  /** Carbon / environmental-data RFQ — see listings/environmental.ts. */
  createOutcomeBid: (draft: OutcomeListingDraft & {
    bid_price_usd_per_mt: string; required_practices: string[]; required_certifications: string[];
    required_data_requirements: string[]; allow_partial: boolean; status?: "draft" | "open";
  }) => request<{ bid: Bid }>("/api/bids", { method: "POST", body: JSON.stringify(draft) }),

  /** Carbon / environmental-data offer — no production data or inventory (see offers_routes.py). */
  createOutcomeOffer: (draft: OutcomeListingDraft & {
    expected_volume: string; desired_price: string; min_order: string; practices: string[];
    certifications: string[]; data_attributes: string[]; status?: "draft" | "published";
  }) => request<{ offer: Offer }>("/api/offers", { method: "POST", body: JSON.stringify(draft) }),

  publishBid: (bidId: string) =>
    request<{ bid: Bid }>(`/api/bids/${bidId}/publish`, { method: "POST" }),

  bidsPendingApproval: () => request<{ bids: Bid[] }>("/api/bids/pending-approval"),

  approveBid: (bidId: string) =>
    request<{ bid: Bid }>(`/api/bids/${bidId}/approve`, { method: "POST" }),

  declineBid: (bidId: string) =>
    request<{ success: boolean }>(`/api/bids/${bidId}/decline`, { method: "POST" }),

  createEnrollment: (draft: EnrollmentDraft) =>
    request<{ enrollment: Enrollment }>("/api/enrollments", { method: "POST", body: JSON.stringify(draft) }),

  myEnrollments: () =>
    request<{ enrollments: Enrollment[]; program_rollup: { published_offers_count: number } }>("/api/enrollments/mine"),

  updateEnrollment: (id: string, patch: Partial<EnrollmentDraft>) =>
    request<{ success: boolean }>(`/api/enrollments/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  deleteEnrollment: (id: string) =>
    request<{ success: boolean }>(`/api/enrollments/${id}`, { method: "DELETE" }),

  programOperators: () => request<{ program_operators: ProgramOperatorOption[] }>("/api/program-operators"),

  activeGrowersForOffers: () =>
    request<{ growers: EnrolledGrowerOption[] }>("/api/enrollments/active-growers"),

  discoverableGrowers: (q: string) =>
    request<{ growers: DiscoverableGrower[] }>(`/api/enrollments/discoverable-growers?q=${encodeURIComponent(q)}`),

  inviteGrower: (growerAccountId: string, acresEnrolled?: string) =>
    request<{ enrollment: Enrollment }>("/api/enrollments/invite", {
      method: "POST", body: JSON.stringify({ grower_account_id: growerAccountId, acres_enrolled: acresEnrolled || undefined }),
    }),

  createGrowerAccount: (draft: NewGrowerDraft) =>
    request<{ enrollment: Enrollment; grower_account_id: string }>("/api/enrollments/create-grower", {
      method: "POST", body: JSON.stringify(draft),
    }),

  enrolledGrowerProductionData: (growerAccountId: string, marketingYear?: string) =>
    request<{ grower_name: string | null; commodities: ProductionDataEntry[] }>(
      `/api/enrollments/growers/${growerAccountId}/production-data${marketingYear ? `?marketing_year=${encodeURIComponent(marketingYear)}` : ""}`,
    ),

  myProgramInvitations: () => request<{ invitations: ProgramAffiliation[] }>("/api/program-affiliation/invitations"),

  acceptProgramInvitation: (id: string) =>
    request<{ success: boolean }>(`/api/program-affiliation/invitations/${id}/accept`, { method: "POST" }),

  declineProgramInvitation: (id: string) =>
    request<{ success: boolean }>(`/api/program-affiliation/invitations/${id}/decline`, { method: "POST" }),

  myProgramAffiliation: () => request<{ affiliation: ProgramAffiliation | null }>("/api/program-affiliation"),

  requestProgramAffiliation: (programOperatorAccountId: string) =>
    request<{ enrollment: Enrollment }>("/api/program-affiliation/request", {
      method: "POST", body: JSON.stringify({ program_operator_account_id: programOperatorAccountId }),
    }),

  cancelProgramAffiliationRequest: (id: string) =>
    request<{ success: boolean }>(`/api/program-affiliation/${id}`, { method: "DELETE" }),

  // -------------------------------------------------------------- buyer representation (Trader)

  internationalBuyers: () => request<{ buyers: ProgramOperatorOption[] }>("/api/international-buyers"),

  requestBuyerRepresentation: (buyerAccountId: string) =>
    request<{ representation: BuyerRepresentation }>("/api/buyer-representations/request", {
      method: "POST", body: JSON.stringify({ buyer_account_id: buyerAccountId }),
    }),

  myRepresentations: () =>
    request<{ representations: BuyerRepresentation[] }>("/api/buyer-representations/mine"),

  activeBuyersForBids: () =>
    request<{ buyers: ProgramOperatorOption[] }>("/api/buyer-representations/active-buyers"),

  cancelRepresentationRequest: (id: string) =>
    request<{ success: boolean }>(`/api/buyer-representations/${id}`, { method: "DELETE" }),

  pendingRepresentationRequests: () =>
    request<{ representations: BuyerRepresentation[] }>("/api/buyer-representations/pending"),

  approveRepresentation: (id: string) =>
    request<{ success: boolean }>(`/api/buyer-representations/${id}/approve`, { method: "PATCH" }),

  declineRepresentation: (id: string) =>
    request<{ success: boolean }>(`/api/buyer-representations/${id}/decline`, { method: "PATCH" }),

  contracts: () => request<{ contracts: Contract[] }>("/api/contracts"),

  myStats: () => request<{ stats: MyStats }>("/api/my-stats"),

  updateContractStatus: (id: string, status: ContractStatus) =>
    request<{ status: ContractStatus }>(`/api/contracts/${id}/status`, {
      method: "PATCH", body: JSON.stringify({ status }),
    }),

  raiseDispute: (contractId: string, reason: string, description?: string, category?: DisputeCategory) =>
    request<{ dispute_id: string; is_time_barred: boolean }>("/api/disputes", {
      method: "POST", body: JSON.stringify({ contract_id: contractId, reason, description, category }),
    }),

  // -------------------------------------------------------------- admin (Phase 7)

  adminDashboard: () => request<AdminDashboard & { success: boolean }>("/api/admin/dashboard"),

  adminAccounts: () => request<{ accounts: AdminAccount[] }>("/api/admin/accounts"),

  freezeAccount: (id: string, frozen: boolean, reason?: string) =>
    request<{ success: boolean; frozen: boolean }>(`/api/admin/accounts/${id}/freeze`, {
      method: "PATCH", body: JSON.stringify({ frozen, reason }),
    }),

  setRoleSwitchingEnabled: (id: string, enabled: boolean) =>
    request<{ success: boolean; role_switching_enabled: boolean }>(`/api/admin/accounts/${id}/role-switching`, {
      method: "PATCH", body: JSON.stringify({ enabled }),
    }),

  adminListings: () => request<{ listings: AdminListing[] }>("/api/admin/listings"),

  adminRemoveListing: (listingType: "offer" | "bid", id: string) =>
    request<{ removed: boolean }>(`/api/admin/listings/${listingType}/${id}`, { method: "DELETE" }),

  adminJoinRequests: () => request<{ requests: JoinRequest[] }>("/api/admin/join-requests"),

  adminApproveJoinRequest: (id: string) =>
    request<{ success: boolean }>(`/api/admin/join-requests/${id}/approve`, { method: "PATCH" }),

  adminDeclineJoinRequest: (id: string) =>
    request<{ success: boolean }>(`/api/admin/join-requests/${id}/decline`, { method: "PATCH" }),

  adminDisputes: () => request<{ disputes: Dispute[] }>("/api/admin/disputes"),

  adminResolveDispute: (id: string, resolutionNotes: string) =>
    request<{ success: boolean }>(`/api/admin/disputes/${id}/resolve`, {
      method: "PATCH", body: JSON.stringify({ resolution_notes: resolutionNotes }),
    }),

  adminAppealDispute: (id: string) =>
    request<{ success: boolean }>(`/api/admin/disputes/${id}/appeal`, { method: "PATCH" }),

  getProductionData: (marketingYear?: string) =>
    request<ProductionDataOverview & { success: boolean }>(
      `/api/production-data${marketingYear ? `?marketing_year=${encodeURIComponent(marketingYear)}` : ""}`,
    ),

  putProductionData: (commodity: string, draft: ProductionDataDraft) =>
    request<{ commodity: string } & ProductionDataEntry & { success: boolean }>(
      `/api/production-data/${commodity}`,
      { method: "PUT", body: JSON.stringify(draft) },
    ),

  uploadVerificationDocument: (commodity: string, file: File) => {
    const form = new FormData();
    form.set("file", file);
    return requestForm<{ commodity: string } & ProductionDataEntry & { success: boolean }>(
      `/api/production-data/${commodity}/verification-document`,
      form,
    );
  },

  deleteVerificationDocument: (commodity: string) =>
    request<{ success: boolean }>(`/api/production-data/${commodity}/verification-document`, { method: "DELETE" }),

  uploadSoilTestDocument: (commodity: string, file: File) => {
    const form = new FormData();
    form.set("file", file);
    return requestForm<{ commodity: string } & ProductionDataEntry & { success: boolean }>(
      `/api/production-data/${commodity}/soil-test-document`,
      form,
    );
  },

  deleteSoilTestDocument: (commodity: string) =>
    request<{ success: boolean }>(`/api/production-data/${commodity}/soil-test-document`, { method: "DELETE" }),

  // Open-ended, labeled multi-document upload (Phase 11) — additive alongside the 2 fixed
  // fields above. See migrations/0052_production_data_documents.sql.
  productionDataDocuments: (commodity: string) =>
    request<{ documents: ProductionDataDocument[] }>(`/api/production-data/${commodity}/documents`),

  uploadProductionDataDocument: (commodity: string, file: File, label: string, category: ProductionDataDocumentCategory) => {
    const form = new FormData();
    form.set("file", file);
    form.set("label", label);
    form.set("category", category);
    return requestForm<{ document: ProductionDataDocument; success: boolean }>(`/api/production-data/${commodity}/documents`, form);
  },

  deleteProductionDataDocument: (commodity: string, documentId: string) =>
    request<{ success: boolean }>(`/api/production-data/${commodity}/documents/${documentId}`, { method: "DELETE" }),

  // Per-listing override documents — only reachable once the offer exists (see OfferForm, which
  // shows this step right after creating a listing whose overrides need their own evidence).
  uploadOfferVerificationDocument: (offerId: string, file: File) => {
    const form = new FormData();
    form.set("file", file);
    return requestForm<{ offer: Offer; success: boolean }>(`/api/offers/${offerId}/verification-document`, form);
  },

  deleteOfferVerificationDocument: (offerId: string) =>
    request<{ offer: Offer; success: boolean }>(`/api/offers/${offerId}/verification-document`, { method: "DELETE" }),

  uploadOfferSoilTestDocument: (offerId: string, file: File) => {
    const form = new FormData();
    form.set("file", file);
    return requestForm<{ offer: Offer; success: boolean }>(`/api/offers/${offerId}/soil-test-document`, form);
  },

  deleteOfferSoilTestDocument: (offerId: string) =>
    request<{ offer: Offer; success: boolean }>(`/api/offers/${offerId}/soil-test-document`, { method: "DELETE" }),

  // Open-ended, labeled multi-document upload (Phase 11) — additive alongside the 2 fixed fields
  // above. See migrations/0046_offer_documents.sql.
  offerDocuments: (offerId: string) =>
    request<{ documents: OfferDocument[] }>(`/api/offers/${offerId}/documents`),

  uploadOfferDocument: (offerId: string, file: File, label: string, category: OfferDocumentCategory) => {
    const form = new FormData();
    form.set("file", file);
    form.set("label", label);
    form.set("category", category);
    return requestForm<{ document: OfferDocument; success: boolean }>(`/api/offers/${offerId}/documents`, form);
  },

  deleteOfferDocument: (offerId: string, documentId: string) =>
    request<{ success: boolean }>(`/api/offers/${offerId}/documents/${documentId}`, { method: "DELETE" }),

  getBuyerRequirements: () => request<{ requirements: BuyerRequirements | null }>("/api/buyer-requirements"),

  putBuyerRequirements: (draft: BuyerRequirementsDraft) =>
    request<{ requirements: BuyerRequirements }>("/api/buyer-requirements", {
      method: "PUT",
      body: JSON.stringify(draft),
    }),

  createDeal: (draft: DealDraft) =>
    request<{ deal_id: string; is_approved: boolean; matches: SuggestedMatch[] }>("/api/deals", {
      method: "POST",
      body: JSON.stringify(draft),
    }),

  previewMatches: (draft: DealDraft) =>
    request<{ matches: SuggestedMatch[] }>("/api/deals/preview", {
      method: "POST",
      body: JSON.stringify(draft),
    }),

  boards: (type: "buyer" | "seller", states: string[], commodities: string[], years: string[] = []) => {
    const p = new URLSearchParams({ type });
    if (states.length) p.set("states", states.join(","));
    if (commodities.length) p.set("commodities", commodities.join(","));
    if (years.length) p.set("years", years.join(","));
    return request<{ deals: Deal[]; current_user_account_id: string }>(`/api/deals?${p}`);
  },

  expressInterest: (dealId: string) =>
    request<{ matches: string[] }>(`/api/deals/${dealId}/interest`, { method: "POST" }),

  matches: () => request<{ matches: MatchDeal[] }>("/api/matches"),

  updateStatus: (dealId: string, matchAccountId: string, status: MatchStatus) =>
    request<{ match_statuses: Record<string, MatchStatus> }>(`/api/matches/${dealId}/status`, {
      method: "POST",
      body: JSON.stringify({ status, match_account_id: matchAccountId }),
    }),

  // Negotiation chat. `party` is only needed by the deal creator (to pick which thread); an
  // interested party's own thread is inferred server-side.
  listMessages: (dealId: string, party?: string) => {
    const q = party ? `?party=${encodeURIComponent(party)}` : "";
    return request<{ messages: ChatMessage[]; party_account_id: string }>(
      `/api/matches/${dealId}/messages${q}`,
    );
  },

  sendMessage: (dealId: string, body: string, party?: string) =>
    request<{ success: boolean }>(`/api/matches/${dealId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body, party }),
    }),

  // Admin oversight: list every listing and remove (take down) any one.
  adminDeals: () => request<{ deals: Deal[] }>("/api/admin/deals/all"),

  removeDeal: (dealId: string) =>
    request<{ removed: boolean }>(`/api/admin/deals/${dealId}`, { method: "DELETE" }),

  // -------------------------------------------------------------- notifications

  notifications: () =>
    request<{ notifications: Notification[]; unread_count: number }>("/api/notifications"),

  markNotificationRead: (id: string) =>
    request<{ success: boolean }>(`/api/notifications/${id}/read`, { method: "PATCH" }),

  markAllNotificationsRead: () =>
    request<{ success: boolean }>("/api/notifications/read-all", { method: "PATCH" }),

  // -------------------------------------------------------------- profile (Phase 10 Pass 1)

  // `summary` skips the gallery-photo lookup (each photo needs its own signed-URL round trip) —
  // pass true from a lightweight display like ProfileHomeCard that never shows the gallery.
  getProfile: (summary = false) =>
    request<{ profile: OwnProfile }>(`/api/profile${summary ? "?summary=1" : ""}`),

  updateProfile: (patch: {
    display_name?: string;
    bio?: string; website_url?: string; links?: ProfileLinkEntry[]; contact_visible?: boolean;
    contact_name?: string; contact_phone?: string; contact_email?: string;
    open_to_program_enrollment?: boolean;
    /** service_provider role only. */
    services_offered?: string[]; states_covered?: string[]; is_trader?: boolean;
  }) => request<{ profile: OwnProfile }>("/api/profile", { method: "PUT", body: JSON.stringify(patch) }),

  uploadProfilePhoto: (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return requestForm<{ profile: OwnProfile; success: boolean }>("/api/profile/photo", form);
  },

  deleteProfilePhoto: () =>
    request<{ profile: OwnProfile }>("/api/profile/photo", { method: "DELETE" }),

  uploadGalleryPhoto: (file: File, caption?: string) => {
    const form = new FormData();
    form.set("file", file);
    if (caption) form.set("caption", caption);
    return requestForm<{ profile: OwnProfile; success: boolean }>("/api/profile/gallery-photos", form);
  },

  deleteGalleryPhoto: (photoId: string) =>
    request<{ profile: OwnProfile }>(`/api/profile/gallery-photos/${photoId}`, { method: "DELETE" }),

  publicProfile: (accountId: string) =>
    request<{ profile: PublicProfile }>(`/api/accounts/${accountId}/public-profile`),

  // -------------------------------------------------------------- service provider marketplace (Phase 10 Pass 2)

  serviceProviders: (filters: { serviceCategories?: string[]; states?: string[] } = {}) => {
    const p = new URLSearchParams();
    if (filters.serviceCategories?.length) p.set("service_categories", filters.serviceCategories.join(","));
    if (filters.states?.length) p.set("states", filters.states.join(","));
    const qs = p.toString();
    return request<{ providers: ServiceProviderListing[] }>(`/api/service-providers${qs ? `?${qs}` : ""}`);
  },

  requestService: (serviceProviderAccountId: string, opts: { serviceCategory?: string; message?: string } = {}) =>
    request<{ request: ServiceRequest }>("/api/service-requests", {
      method: "POST",
      body: JSON.stringify({
        service_provider_account_id: serviceProviderAccountId,
        service_category: opts.serviceCategory,
        message: opts.message,
      }),
    }),

  myServiceRequests: () => request<{ requests: ServiceRequest[] }>("/api/service-requests/mine"),

  pendingServiceRequests: (status: ServiceRequestStatus = "pending") =>
    request<{ requests: ServiceRequest[] }>(`/api/service-requests/pending?status=${status}`),

  cancelServiceRequest: (requestId: string) =>
    request<{ success: boolean }>(`/api/service-requests/${requestId}`, { method: "DELETE" }),

  acceptServiceRequest: (requestId: string) =>
    request<{ success: boolean }>(`/api/service-requests/${requestId}/accept`, { method: "PATCH" }),

  declineServiceRequest: (requestId: string) =>
    request<{ success: boolean }>(`/api/service-requests/${requestId}/decline`, { method: "PATCH" }),

  // -------------------------------------------------------------- directory (Phase 12)

  directory: (roles: string[] = [], hasListingsOnly = false) => {
    const p = new URLSearchParams();
    if (roles.length) p.set("roles", roles.join(","));
    if (hasListingsOnly) p.set("has_listings", "1");
    const qs = p.toString();
    return request<{ entries: DirectoryEntry[] }>(`/api/directory${qs ? `?${qs}` : ""}`);
  },

  organizations: () => request<{ organizations: Organization[] }>("/api/organizations"),

  // -------------------------------------------- company documentation (Phase 12)

  businessVerification: () => request<{ verification: BusinessVerification }>("/api/account/verification"),

  saveBusinessIdentifier: (identifierType: string, identifierValue: string) =>
    request<{ verification: BusinessVerification }>("/api/account/verification", {
      method: "PUT", body: JSON.stringify({ identifier_type: identifierType, identifier_value: identifierValue }),
    }),

  accountDocuments: () => request<{ documents: AccountDocument[] }>("/api/account/documents"),

  uploadAccountDocument: (file: File, label: string) => {
    const form = new FormData();
    form.set("file", file);
    form.set("label", label);
    return requestForm<{ document: AccountDocument; success: boolean }>("/api/account/documents", form);
  },

  deleteAccountDocument: (documentId: string) =>
    request<{ success: boolean }>(`/api/account/documents/${documentId}`, { method: "DELETE" }),

  adminAccountDocuments: (accountId: string) =>
    request<{ documents: AccountDocument[] }>(`/api/admin/accounts/${accountId}/documents`),

  setAccountApproval: (accountId: string, approved: boolean, note?: string) =>
    request<{ success: boolean; approval_status: AccountApprovalStatus }>(
      `/api/admin/accounts/${accountId}/approval`,
      { method: "PATCH", body: JSON.stringify({ approved, note }) },
    ),

  listServiceRequestMessages: (requestId: string) =>
    request<{ messages: ChatMessage[] }>(`/api/service-requests/${requestId}/messages`),

  sendServiceRequestMessage: (requestId: string, body: string) =>
    request<{ success: boolean }>(`/api/service-requests/${requestId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
};

import { useEffect, useState } from "react";
import { api } from "../api";
import { US_STATES } from "../constants";
import { ChipMultiSelect, DateRangeField, NumberInput, ReviewDialog, SummaryRows, dateRangeError, withoutNone } from "../ui";
import { useAppNav } from "../AppNavContext";
import { useVerification } from "../profile/VerificationPrompt";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import AttributeRequestLink from "../AttributeRequestLink";
import { toAcres, yieldToVolume } from "../units";
import { formatCurrency, formatNumber } from "../format";
import SupplyOfferCard from "./SupplyOfferCard";
import type {
  AreaUnit, CountyOption, EnrolledGrowerOption, GrowerInventoryRow, Offer, OfferDocumentCategory, OfferDraft, OfferLocation,
  PriceType, ProductionDataEntry, QuantityYieldUnit, GrainUom, YieldUnit,
} from "../types";
import {
  COMMODITY_VARIETIES, GRAIN_COMMODITIES, PRICE_TYPE_OPTIONS, UOM_OPTIONS, marketingYears,
} from "../listings/constants";

const MARKETING_YEARS = marketingYears();
const AREA_UNITS: AreaUnit[] = ["acres", "hectares"];

// A single locked choice drives Area Unit + Yield Unit + Total Volume Unit together for an
// acres-basis offer — replaces 3 independently-editable selectors that growers found confusing
// (easy to end up with e.g. hectares + bu/acre + MT without noticing). "lbs/acre" stays available
// as a secondary Yield Unit choice within Bushels & Acres — Total Volume is still computed/shown
// in bushels either way (see units.ts's yieldToVolume).
type UnitSystemId = "bushels_acres" | "metric_tons_hectares";
type UnitSystemConfig = { id: UnitSystemId; label: string; areaUnit: AreaUnit; uom: GrainUom; yieldUnits: QuantityYieldUnit[] };
// A fixed-length tuple (not a plain array) so UNIT_SYSTEMS[0] is known non-undefined even under
// noUncheckedIndexedAccess — this is the fallback/default system, not an arbitrary pick.
const UNIT_SYSTEMS: readonly [UnitSystemConfig, UnitSystemConfig] = [
  { id: "bushels_acres", label: "Bushels & Acres", areaUnit: "acres", uom: "bushels", yieldUnits: ["bu/acre", "lbs/acre"] },
  { id: "metric_tons_hectares", label: "Metric Tons & Hectares", areaUnit: "hectares", uom: "MT", yieldUnits: ["MT/hectare"] },
];

// The three real-world offerings a grower makes, replacing the old two-independent-toggle
// design (Availability x Quantity Basis, 4 combinations) — "available acres" never made much
// physical sense (planted acreage is inherently a future-delivery concept), so each option here
// sets BOTH listing_timing and quantity_basis together, collapsing to the 3 that do.
type OfferingChoice = "available_grain" | "future_grain" | "acres_planting";
const OFFERING_CHOICES: { id: OfferingChoice; label: string; listing_timing: "available" | "future"; quantity_basis: "grain" | "acres" }[] = [
  { id: "available_grain", label: "Available Grain", listing_timing: "available", quantity_basis: "grain" },
  { id: "future_grain", label: "Grain for Future Delivery", listing_timing: "future", quantity_basis: "grain" },
  { id: "acres_planting", label: "Acres for Planting", listing_timing: "future", quantity_basis: "acres" },
];

// Program operators list in one of three ways. "own" is listing as if they were a grower;
// "aggregate" pools several enrolled growers' grain into one listing under the operator's name
// (enrollment is the growers' consent, they're notified); "single" lists one grower's grain on
// their behalf, which goes live only once that grower approves it.
type ListingFor = "own" | "aggregate" | "single";
const LISTING_FOR_CHOICES: { id: ListingFor; label: string; hint: string }[] = [
  { id: "own", label: "My own grain", hint: "List as if you were a grower." },
  { id: "aggregate", label: "Aggregate enrolled growers", hint: "Pool several enrolled growers' grain into one listing." },
  { id: "single", label: "One enrolled grower", hint: "List one grower's grain on their behalf — they approve it first." },
];

const EMPTY: OfferDraft = {
  commodity: "", variety: "", marketing_year: MARKETING_YEARS[1] ?? "", quantity_basis: "grain", listing_timing: "available",
  delivery_window_start: "", delivery_window_end: "", expected_volume: "", uom: "bushels", acres_offered: "", area_unit: "acres",
  yield_rate: "", yield_unit: "",
  price_type: "", desired_price: "", protein_pct: "", moisture_pct_max: "",
  test_weight: "", bcfm_pct: "3", seed_variety: "",
  tannin_level_max: "", non_tannin_sorghum: false, bnfm_pct: "",
  min_order: "", harvest_start: "", harvest_end: "",
  sustainability_attributes: [], specialty_attributes: [],
  locations: [], certifications: [],
  override_actual_yield_per_acre: "", override_yield_unit: "", override_irrigation_type: "", override_crop_rotation_years: "",
  override_crop_rotation_crops: "",
  override_soil_test_on_file: null, override_third_party_verified: null, override_input_usage_notes: "",
  override_conservation_practices: null,
};

/** County selection is always scoped to an already-picked state — county names collide across
 * states, so this never offers a free-standing national search (see counties_routes.py). */
export function CountyPicker({
  state, selected, onChange,
}: {
  state: string;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<CountyOption[]>([]);

  useEffect(() => {
    const handle = setTimeout(() => {
      api.searchCounties(state, q).then((r) => setOptions(r.counties)).catch(() => setOptions([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [state, q]);

  // Always show already-picked counties as removable chips, even if the current search page
  // (or an empty/cleared query) doesn't happen to include them.
  const labels = Array.from(new Set([...selected, ...options.map((c) => c.name)]));

  return (
    <div className="mt-2 rounded-lg border border-brand-edge p-3">
      <label className="label">Counties in {state}</label>
      <input className="field mb-2" placeholder="Search counties…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ChipMultiSelect options={labels} selected={selected} onChange={onChange} />
    </div>
  );
}

export default function OfferForm({ onCreated, forOperator }: { onCreated: () => void; forOperator?: boolean }) {
  const [draft, setDraft] = useState<OfferDraft>(EMPTY);
  const [overrideProduction, setOverrideProduction] = useState(false);
  // Files are staged here and only uploaded once the offer exists (the upload endpoint needs a
  // real offer id) — but that upload happens as part of the same submit, right after creation,
  // so from the grower's point of view attaching a document is just part of filling out the form.
  const [verificationFile, setVerificationFile] = useState<File | null>(null);
  const [soilTestFile, setSoilTestFile] = useState<File | null>(null);
  // Open-ended, labeled multi-document uploads (Phase 11) — staged here the same way
  // verificationFile/soilTestFile are, uploaded one by one right after the offer is created.
  const [stagedDocuments, setStagedDocuments] = useState<{ file: File; label: string; category: OfferDocumentCategory }[]>([]);
  const [newDocLabel, setNewDocLabel] = useState("");
  const [newDocCategory, setNewDocCategory] = useState<OfferDocumentCategory>("general");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"draft" | "published" | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  // Used to decide where the Conservation Practices picker shows: if this commodity already has
  // saved defaults, it's an override (hidden behind "differs from defaults"); if not — first
  // time creating a listing for this crop — there's nothing to override, so show it directly.
  const [productionEntries, setProductionEntries] = useState<ProductionDataEntry[] | null>(null);
  // Operator-only: list this offer attributed to one of their actively-enrolled growers instead
  // of their own grain. "" means their own grain.
  const [growers, setGrowers] = useState<EnrolledGrowerOption[] | null>(null);
  const [listingFor, setListingFor] = useState<ListingFor>("own");
  const [onBehalfOf, setOnBehalfOf] = useState("");
  // Aggregate mode: grower id -> contributed volume (raw numeric string, offer's uom), plus the
  // operator's own optional share. Offered Volume is their sum.
  const [contributions, setContributions] = useState<Record<string, string>>({});
  const [ownContribution, setOwnContribution] = useState("");
  const { goToDashboardTab } = useAppNav();
  const { requireVerified } = useVerification();
  const [inventoryRows, setInventoryRows] = useState<GrowerInventoryRow[] | null>(null);
  const [remainingPreview, setRemainingPreview] = useState<{
    remaining_volume: number | null; remaining_acres: number | null; uom: GrainUom | null; area_unit: AreaUnit | null;
  } | null>(null);

  const sustainabilityAttributes = useTaxonomyTerms("attribute", "sustainability");
  const specialtyAttributes = useTaxonomyTerms("attribute", "specialty");
  const practices = useTaxonomyTerms("practice");
  const certifications = useTaxonomyTerms("certification");

  useEffect(() => {
    api.getProductionData().then((r) => setProductionEntries(r.commodities)).catch(() => setProductionEntries([]));
  }, []);

  useEffect(() => {
    if (forOperator) api.activeGrowersForOffers().then((r) => setGrowers(r.growers)).catch(() => setGrowers([]));
  }, [forOperator]);

  // The account's own inventory — used both to restrict the Marketing Year dropdown to years
  // that actually have a balance (below) and to preview remaining capacity as the form is filled
  // in, rather than only surfacing the cap as a 400 error after submitting.
  useEffect(() => {
    api.growerInventory().then((r) => setInventoryRows(r.inventory)).catch(() => setInventoryRows([]));
  }, []);

  const selectedGrower = (growers ?? []).find((g) => g.grower_account_id === onBehalfOf) ?? null;
  const aggregating = forOperator && listingFor === "aggregate";
  const aggregateRows = Object.entries(contributions).filter(([, v]) => v !== "");
  const aggregateTotal = aggregateRows.reduce((sum, [, v]) => sum + Number(v), 0) + (ownContribution ? Number(ownContribution) : 0);
  const growerName = (id: string) => (growers ?? []).find((g) => g.grower_account_id === id)?.grower_name || "Enrolled grower";

  const chooseListingFor = (next: ListingFor) => {
    setListingFor(next);
    if (next !== "single") setOnBehalfOf("");
    if (next !== "aggregate") { setContributions({}); setOwnContribution(""); }
    // Aggregation pools volumes, so it's grain-basis only.
    if (next === "aggregate" && draft.quantity_basis === "acres") {
      setDraft((d) => ({ ...d, quantity_basis: "grain", listing_timing: "future" }));
    }
  };

  // Production Data is private to its own account — there's no way to peek at the grower's
  // saved commodity defaults from here, so an on-behalf-of listing always gets the direct
  // picker rather than guessing whether "differs from defaults" applies.
  const commodityHasDefaultPractices = !onBehalfOf && !!productionEntries
    ?.find((e) => e.commodity === draft.commodity)
    ?.conservation_practices.length;

  const set = <K extends keyof OfferDraft>(k: K, v: OfferDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const unitSystem = UNIT_SYSTEMS.find((s) => s.areaUnit === draft.area_unit) ?? UNIT_SYSTEMS[0];
  const setUnitSystem = (id: UnitSystemId) => {
    const sys = UNIT_SYSTEMS.find((s) => s.id === id);
    if (!sys) return;
    setDraft((d) => ({
      ...d,
      area_unit: sys.areaUnit,
      uom: sys.uom,
      yield_unit: sys.yieldUnits.includes(d.yield_unit as QuantityYieldUnit) ? d.yield_unit : (sys.yieldUnits[0] ?? ""),
    }));
  };
  const computedVolume = draft.acres_offered && draft.yield_rate && draft.yield_unit && draft.commodity
    ? yieldToVolume(
        toAcres(Number(draft.acres_offered), draft.area_unit),
        Number(draft.yield_rate), draft.yield_unit, draft.commodity, draft.uom,
      )
    : null;

  const offeringChoice: OfferingChoice = OFFERING_CHOICES.find(
    (c) => c.listing_timing === draft.listing_timing && c.quantity_basis === draft.quantity_basis,
  )?.id ?? "available_grain";

  const setOfferingChoice = (id: OfferingChoice) => {
    const choice = OFFERING_CHOICES.find((c) => c.id === id);
    if (!choice) return;
    setDraft((d) => ({ ...d, listing_timing: choice.listing_timing, quantity_basis: choice.quantity_basis }));
  };

  // Acres is shown either as the Acres segment's primary quantity input, or (when quantity_basis
  // is "grain") as a supplementary field only when this is an on-behalf-of listing — the number
  // the enrolled-acres cap is measured against. Same field/unit toggle either way.
  const showAcresBox = draft.quantity_basis === "acres" || !!onBehalfOf;

  // Only years this account actually has a balance for (matching the same commodity + basis) —
  // but only once a crop is picked, and only for the account's own grain (on-behalf-of listings
  // aren't capped against the operator's own inventory, so the year picker stays unrestricted
  // there too — see offers_routes.py's create_offer cap-check, gated the same way). Falls back to
  // the full default range when there's no inventory for this commodity yet, matching the
  // backend's own soft-cap philosophy: nothing set up yet means nothing to restrict against.
  const yearsWithInventory = !onBehalfOf && draft.commodity
    ? Array.from(new Set(
        (inventoryRows ?? [])
          .filter((r) => r.commodity === draft.commodity && r.quantity_basis === draft.quantity_basis)
          .map((r) => r.marketing_year),
      ))
    : [];
  const yearOptions = yearsWithInventory.length > 0 ? yearsWithInventory : MARKETING_YEARS;

  useEffect(() => {
    const firstOption = yearOptions[0];
    if (firstOption && !yearOptions.includes(draft.marketing_year)) {
      set("marketing_year", firstOption);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.commodity, draft.quantity_basis, onBehalfOf, inventoryRows]);

  // Live remaining-capacity preview — same lookup RespondAmountModal already uses, surfaced here
  // too so the cap is visible before submitting, not just as a 400 error after.
  useEffect(() => {
    if (onBehalfOf || !draft.commodity || !draft.marketing_year) {
      setRemainingPreview(null);
      return;
    }
    api.growerInventoryRemaining(draft.commodity, draft.marketing_year, draft.quantity_basis)
      .then(setRemainingPreview).catch(() => setRemainingPreview(null));
  }, [draft.commodity, draft.marketing_year, draft.quantity_basis, onBehalfOf]);

  const toggleOverride = (on: boolean) => {
    setOverrideProduction(on);
    if (!on) {
      set("override_actual_yield_per_acre", "");
      set("override_yield_unit", "");
      set("override_irrigation_type", "");
      set("override_crop_rotation_years", "");
      set("override_crop_rotation_crops", "");
      set("override_soil_test_on_file", null);
      set("override_third_party_verified", null);
      set("override_input_usage_notes", "");
      // Only clear this if it was actually part of the override section — when there's no
      // commodity default yet, it's shown (and meant to persist) outside the override toggle.
      if (commodityHasDefaultPractices) set("override_conservation_practices", null);
      setVerificationFile(null);
      setSoilTestFile(null);
    }
  };

  const toggleLocationState = (states: string[]) => {
    set("locations", states.map((s) => draft.locations.find((l) => l.state === s) || { state: s, counties: [] }));
  };

  const setLocationCounties = (state: string, counties: string[]) => {
    set("locations", draft.locations.map((l) => (l.state === state ? { ...l, counties } : l)));
  };

  const validate = (): string | null => {
    if (!draft.commodity) return "Crop is required";
    if (draft.listing_timing === "future" && !(draft.delivery_window_start && draft.delivery_window_end)) {
      return "Delivery Window Start and End are required for a Future listing";
    }
    const rangeErr = dateRangeError(draft.delivery_window_start, draft.delivery_window_end, "Delivery Window")
      ?? dateRangeError(draft.harvest_start, draft.harvest_end, "Harvest Window");
    if (rangeErr) return rangeErr;
    if (aggregating) {
      if (aggregateRows.length === 0) return "Add at least one enrolled grower's contribution";
      if (aggregateRows.some(([, v]) => Number(v) <= 0)) return "Each grower's contribution must be more than 0";
    } else if (forOperator && listingFor === "single" && !onBehalfOf) {
      return "Select which enrolled grower this listing is for";
    } else if (draft.quantity_basis === "grain") {
      if (!draft.expected_volume || Number(draft.expected_volume) <= 0) return "Offered volume is required";
    } else {
      if (!draft.acres_offered || Number(draft.acres_offered) <= 0) return "Acres is required";
      if (!draft.yield_rate || Number(draft.yield_rate) <= 0) return "Yield rate is required";
      if (!draft.yield_unit) return "Yield unit is required";
    }
    if (onBehalfOf && (!draft.acres_offered || Number(draft.acres_offered) <= 0)) {
      return "Acres Offered is required when listing on behalf of an enrolled grower";
    }
    return null;
  };

  const requestPublish = () => {
    if (!requireVerified("publish a listing")) return;
    const err = validate();
    if (err) return setError(err);
    setError(null);
    setShowConfirm(true);
  };

  const submit = async (status: "draft" | "published") => {
    const err = validate();
    if (err) return setError(err);
    setError(null);
    setNotice(null);
    setShowConfirm(false);
    setSubmitting(status);
    try {
      const acresOfferedAcres = draft.acres_offered
        ? String(toAcres(Number(draft.acres_offered), draft.area_unit))
        : "";
      const { offer } = await api.createOffer({
        ...draft, acres_offered: acresOfferedAcres, status,
        expected_volume: aggregating ? String(aggregateTotal) : draft.expected_volume,
        on_behalf_of_grower_account_id: onBehalfOf || undefined,
        aggregate_growers: aggregating
          ? aggregateRows.map(([grower_account_id, contributed_volume]) => ({ grower_account_id, contributed_volume }))
          : undefined,
      });
      const docErrors: string[] = [];
      if (verificationFile) {
        try {
          await api.uploadOfferVerificationDocument(offer.id, verificationFile);
        } catch (e) {
          docErrors.push(`verification statement (${e instanceof Error ? e.message : "upload failed"})`);
        }
      }
      if (soilTestFile) {
        try {
          await api.uploadOfferSoilTestDocument(offer.id, soilTestFile);
        } catch (e) {
          docErrors.push(`soil test document (${e instanceof Error ? e.message : "upload failed"})`);
        }
      }
      for (const doc of stagedDocuments) {
        try {
          await api.uploadOfferDocument(offer.id, doc.file, doc.label, doc.category);
        } catch (e) {
          docErrors.push(`"${doc.label}" (${e instanceof Error ? e.message : "upload failed"})`);
        }
      }
      const wasOnBehalfOf = !!onBehalfOf;
      const wasAggregate = aggregating ? aggregateRows.length : 0;
      setDraft(EMPTY);
      setOverrideProduction(false);
      setVerificationFile(null);
      setSoilTestFile(null);
      setStagedDocuments([]);
      setOnBehalfOf("");
      setContributions({});
      setOwnContribution("");
      onCreated();
      if (docErrors.length) {
        setError(`Offer created, but attaching the ${docErrors.join(" and ")} failed — attach it from My Listings.`);
      } else if (wasOnBehalfOf) {
        setNotice("Sent to the grower for approval — it won't be listed until they approve it.");
      } else if (wasAggregate) {
        setNotice(status === "draft"
          ? "Aggregated listing saved as a draft."
          : `Aggregated listing published — the ${wasAggregate} contributing grower${wasAggregate === 1 ? " has" : "s have"} been notified.`);
      } else if (status === "draft") {
        setNotice("Saved as a draft — publish it from Your Listings when you're ready.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(null);
    }
  };

  /** The draft shaped as the Offer the marketplace card renders — what buyers will see once it's
   * published. Production data mirrors how the server resolves it: this crop's saved defaults,
   * with this listing's overrides on top. */
  const previewOffer = (): Offer => {
    const num = (v: string) => (v === "" ? null : Number(v));
    const defaults = !onBehalfOf ? productionEntries?.find((e) => e.commodity === draft.commodity) : undefined;
    const volume = draft.quantity_basis === "acres" ? computedVolume : aggregating ? aggregateTotal : num(draft.expected_volume);
    const now = new Date().toISOString();
    return {
      id: "preview", created_by: "", on_behalf_of_grower_account_id: onBehalfOf || null, grower_approval_status: "approved",
      commodity: draft.commodity, variety: draft.variety || null, marketing_year: draft.marketing_year || null,
      quantity_basis: draft.quantity_basis, listing_timing: draft.listing_timing,
      delivery_window_start: draft.delivery_window_start || null, delivery_window_end: draft.delivery_window_end || null,
      expected_volume: volume, uom: draft.uom, acres_offered: num(draft.acres_offered),
      area_unit: draft.quantity_basis === "acres" ? draft.area_unit : null,
      yield_rate: num(draft.yield_rate), yield_unit: draft.yield_unit || null,
      price_type: draft.price_type || null, desired_price: num(draft.desired_price),
      protein_pct: num(draft.protein_pct), moisture_pct_max: num(draft.moisture_pct_max),
      test_weight: num(draft.test_weight), bcfm_pct: num(draft.bcfm_pct), seed_variety: draft.seed_variety || null,
      tannin_level_max: num(draft.tannin_level_max), non_tannin_sorghum: draft.non_tannin_sorghum, bnfm_pct: num(draft.bnfm_pct),
      min_order: num(draft.min_order), harvest_start: draft.harvest_start || null, harvest_end: draft.harvest_end || null,
      sustainability_attributes: draft.sustainability_attributes, specialty_attributes: draft.specialty_attributes,
      locations: draft.locations, certifications: draft.certifications,
      status: "published", created_at: now, updated_at: now, has_active_negotiation: false, remaining_volume: volume,
      aggregate_growers: aggregating
        ? aggregateRows.map(([id, v]) => ({ grower_account_id: id, grower_name: growerName(id), contributed_volume: Number(v) }))
        : [],
      production: {
        actual_yield_per_acre: num(draft.override_actual_yield_per_acre) ?? defaults?.actual_yield_per_acre ?? null,
        yield_unit: draft.override_yield_unit || defaults?.yield_unit || null,
        irrigation_type: draft.override_irrigation_type || defaults?.irrigation_type || null,
        crop_rotation_years: num(draft.override_crop_rotation_years) ?? defaults?.crop_rotation_years ?? null,
        crop_rotation_crops: num(draft.override_crop_rotation_crops) ?? defaults?.crop_rotation_crops ?? null,
        soil_test_on_file: draft.override_soil_test_on_file ?? defaults?.soil_test_on_file ?? false,
        third_party_verified: draft.override_third_party_verified ?? defaults?.third_party_verified ?? false,
        input_usage_notes: draft.override_input_usage_notes || defaults?.input_usage_notes || null,
        conservation_practices: withoutNone(draft.override_conservation_practices ?? defaults?.conservation_practices ?? []),
        has_override: overrideProduction, has_default: !!defaults && defaults.advanced_completion_pct > 0,
        has_verification_document: false, verification_document_url: null,
        has_soil_test_document: false, soil_test_document_url: null,
        show_advanced_in_listing: false,
      },
    };
  };

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-slate-900">Create New Offer</h2>
      <p className="mt-0.5 text-sm text-slate-600">
        Fill in the details below to create a new offer of grain or acres to contract.
      </p>
      <p className="mt-1 text-xs text-slate-400">* denotes a required field</p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}

      {forOperator && (
        <div className="mt-4 rounded-lg border border-brand-edge p-3">
          <label className="label">List this offer for *</label>
          <div className="flex flex-col gap-1.5 sm:flex-row">
            {LISTING_FOR_CHOICES.map((c) => {
              const needsGrowers = c.id !== "own";
              const disabled = needsGrowers && (growers?.length ?? 0) === 0;
              return (
                <button key={c.id} type="button" disabled={disabled} title={c.hint}
                  onClick={() => chooseListingFor(c.id)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                    listingFor === c.id ? "border-brand-green bg-brand-greenLight text-brand-green" : "border-brand-edge text-slate-600"
                  }`}>
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs opacity-80">{c.hint}</div>
                </button>
              );
            })}
          </div>

          {growers && growers.length === 0 && (
            <div className="mt-3 rounded-lg border border-dashed border-brand-edge bg-brand-bg/50 p-4 text-sm text-slate-600">
              <div className="font-medium text-slate-800">Your enrolled growers will appear here</div>
              <p className="mt-1">
                Invite registered growers — or register new ones — to your program, and you'll be able to
                aggregate their grain or create listings on their behalf.
              </p>
              <button type="button" className="btn-ghost mt-2 !px-2 !py-1 text-xs" onClick={() => goToDashboardTab("growers")}>
                Go to Enrolled Growers →
              </button>
            </div>
          )}

          {listingFor === "single" && growers && growers.length > 0 && (
            <div className="mt-3">
              <select className="field" value={onBehalfOf} onChange={(e) => setOnBehalfOf(e.target.value)}>
                <option value="">Select an enrolled grower</option>
                {growers.map((g) => (
                  <option key={g.grower_account_id} value={g.grower_account_id}>
                    {g.grower_name || "Unnamed grower"}
                    {g.acres_remaining != null ? ` — ${formatNumber(g.acres_remaining)} acres remaining` : ""}
                  </option>
                ))}
              </select>
              {selectedGrower && (
                <p className="mt-1 text-xs text-slate-500">
                  This offer will be sent to {selectedGrower.grower_name || "the grower"} for approval before it's listed.
                  {selectedGrower.acres_remaining != null && ` They have ${formatNumber(selectedGrower.acres_remaining)} enrolled acres remaining.`}
                </p>
              )}
            </div>
          )}

          {aggregating && growers && growers.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-500">
                Enter how much of each enrolled grower's grain goes into this listing ({draft.uom}). It's listed under
                your name; contributing growers are notified.
              </p>
              {growers.map((g) => {
                const on = g.grower_account_id in contributions;
                return (
                  <div key={g.grower_account_id} className="flex items-center gap-3">
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={on} onChange={(e) => setContributions((c) => {
                        const next = { ...c };
                        if (e.target.checked) next[g.grower_account_id] = ""; else delete next[g.grower_account_id];
                        return next;
                      })} />
                      <span className="truncate">{g.grower_name || "Unnamed grower"}</span>
                    </label>
                    {on && (
                      <div className="w-44">
                        <NumberInput placeholder={`Volume (${draft.uom})`} value={contributions[g.grower_account_id] ?? ""}
                          onChange={(v) => setContributions((c) => ({ ...c, [g.grower_account_id]: v }))} />
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex items-center gap-3 border-t border-brand-edge pt-2">
                <span className="flex-1 text-sm text-slate-700">Plus your own grain (optional)</span>
                <div className="w-44">
                  <NumberInput placeholder={`Volume (${draft.uom})`} value={ownContribution} onChange={setOwnContribution} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* One 3-way choice up front — replaces the old two-independent-toggle design. Everything
          below flows from whichever of these is picked, not side by side with it. */}
      <div className="mt-4">
        <label className="label">What you are offering *</label>
        <div className="flex flex-col gap-1.5 sm:flex-row">
          {OFFERING_CHOICES.filter((c) => !aggregating || c.quantity_basis === "grain").map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setOfferingChoice(c.id)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                offeringChoice === c.id ? "border-brand-green bg-brand-greenLight text-brand-green" : "border-brand-edge text-slate-600"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <h3 className="mt-6 text-sm font-semibold text-slate-900">The Details of Your Offer</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Crop *</label>
          <select className="field" value={draft.commodity}
            onChange={(e) => {
              const commodity = e.target.value;
              // Pre-fill from this commodity's saved Production Data defaults (still freely
              // editable below) — only when this is the grower's own account; there's no way
              // to peek at an on-behalf-of grower's production_data from here (see
              // commodityHasDefaultPractices above), so an on-behalf-of listing always starts
              // these two blank, same as conservation practices does.
              const defaults = !onBehalfOf ? productionEntries?.find((p) => p.commodity === commodity) : undefined;
              setDraft((d) => ({
                ...d, commodity, variety: "",
                sustainability_attributes: withoutNone(defaults?.sustainability_attributes ?? []),
                specialty_attributes: withoutNone(defaults?.specialty_attributes ?? []),
              }));
            }}>
            <option value="">Select crop</option>
            {GRAIN_COMMODITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Variety / Class</label>
          <select className="field" value={draft.variety} disabled={!COMMODITY_VARIETIES[draft.commodity]}
            onChange={(e) => set("variety", e.target.value)}>
            <option value="">{COMMODITY_VARIETIES[draft.commodity] ? "Select variety" : "No varieties for this crop"}</option>
            {(COMMODITY_VARIETIES[draft.commodity] ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Marketing Year</label>
          <select className="field" value={draft.marketing_year} onChange={(e) => set("marketing_year", e.target.value)}>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <DateRangeField className="sm:col-span-2" label="Delivery Window" required={draft.listing_timing === "future"}
          start={draft.delivery_window_start} end={draft.delivery_window_end}
          onStartChange={(v) => set("delivery_window_start", v)} onEndChange={(v) => set("delivery_window_end", v)} />

        {draft.quantity_basis === "grain" ? (
          <>
            <div>
              <label className="label">Offered Volume *</label>
              <div className="flex gap-2">
                {aggregating ? (
                  <div className="field flex items-center bg-slate-50 text-slate-600" title="Sum of the growers' contributions above">
                    {formatNumber(aggregateTotal)}
                  </div>
                ) : (
                  <NumberInput value={draft.expected_volume}
                    onChange={(v) => set("expected_volume", v)} />
                )}
                <select className="field w-32 shrink-0" aria-label="Unit" value={draft.uom} onChange={(e) => set("uom", e.target.value as GrainUom)}>
                  {UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              {remainingPreview?.remaining_volume != null && (
                <p className="mt-1 text-xs text-slate-500">
                  {formatNumber(remainingPreview.remaining_volume, 1)} {remainingPreview.uom} of {draft.commodity} remaining for {draft.marketing_year}
                </p>
              )}
            </div>
            {showAcresBox && (
              <div>
                <label className="label">Area Offered *</label>
                <div className="flex gap-2">
                  <NumberInput value={draft.acres_offered}
                    onChange={(v) => set("acres_offered", v)} />
                  <select className="field" value={draft.area_unit} onChange={(e) => set("area_unit", e.target.value as AreaUnit)}>
                    {AREA_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="sm:col-span-2">
              <label className="label">Unit System *</label>
              <div className="flex flex-col gap-1.5 sm:flex-row">
                {UNIT_SYSTEMS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setUnitSystem(s.id)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      unitSystem.id === s.id ? "border-brand-green bg-brand-greenLight text-brand-green" : "border-brand-edge text-slate-600"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Yield Rate *</label>
              <NumberInput value={draft.yield_rate}
                onChange={(v) => set("yield_rate", v)} />
            </div>
            <div>
              <label className="label">Yield Unit *</label>
              <select className="field" value={draft.yield_unit} disabled={unitSystem.yieldUnits.length <= 1}
                onChange={(e) => set("yield_unit", e.target.value as QuantityYieldUnit | "")}>
                {unitSystem.yieldUnits.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Area *</label>
              <NumberInput value={draft.acres_offered}
                onChange={(v) => set("acres_offered", v)} />
              <p className="mt-1 text-xs text-slate-500">
                In {unitSystem.areaUnit} (set by Unit System above).
                {remainingPreview?.remaining_acres != null && (
                  <> {formatNumber(remainingPreview.remaining_acres, 1)} {remainingPreview.area_unit} of {draft.commodity} remaining for {draft.marketing_year}.</>
                )}
              </p>
            </div>
            <div>
              <label className="label">Total Volume</label>
              <div className="field flex items-center bg-slate-50 text-slate-600">
                {computedVolume != null ? `${formatNumber(computedVolume, 1)} ${draft.uom}` : "—"}
              </div>
              <p className="mt-1 text-xs text-slate-500">Computed automatically from Area × Yield Rate.</p>
            </div>
          </>
        )}

        <div>
          <label className="label">Price Type</label>
          <select className="field" value={draft.price_type}
            onChange={(e) => set("price_type", e.target.value as PriceType | "")}>
            <option value="">Select price type</option>
            {PRICE_TYPE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Desired Price ($/{draft.uom === "bushels" ? "bushel" : "MT"})</label>
          <NumberInput value={draft.desired_price}
            onChange={(v) => set("desired_price", v)} />
        </div>
        <div>
          <label className="label">{draft.quantity_basis === "acres" ? "Minimum Delivery Area" : "Minimum Delivery Volume"}</label>
          <NumberInput value={draft.min_order}
            onChange={(v) => set("min_order", v)} />
        </div>
        <DateRangeField className="sm:col-span-2" label="Harvest Window"
          start={draft.harvest_start} end={draft.harvest_end}
          onStartChange={(v) => set("harvest_start", v)} onEndChange={(v) => set("harvest_end", v)} />
      </div>

      <h4 className="mt-6 text-sm font-semibold text-slate-900">Grain Requirements</h4>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Protein %</label>
          <NumberInput value={draft.protein_pct}
            onChange={(v) => set("protein_pct", v)} />
        </div>
        <div>
          <label className="label">Moisture % Max</label>
          <NumberInput value={draft.moisture_pct_max}
            onChange={(v) => set("moisture_pct_max", v)} />
        </div>
        <div>
          <label className="label">Test Weight</label>
          <NumberInput value={draft.test_weight}
            onChange={(v) => set("test_weight", v)} />
        </div>
        <div>
          <label className="label">BCFM %</label>
          <NumberInput value={draft.bcfm_pct}
            onChange={(v) => set("bcfm_pct", v)} />
          <p className="mt-1 text-xs text-slate-500">Broken Corn and Foreign Material — defaults to 3%.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Seed Variety</label>
          <div className="flex gap-4">
            {(["Non-GM", "GM"] as const).map((v) => (
              <label key={v} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="radio" name="seed_variety" checked={draft.seed_variety === v}
                  onChange={() => set("seed_variety", v)} />
                {v}
              </label>
            ))}
          </div>
        </div>
        {draft.commodity === "Sorghum" && (
          <>
            <div>
              <label className="label">Tannin Level (Max.)</label>
              <NumberInput value={draft.tannin_level_max}
                onChange={(v) => set("tannin_level_max", v)} />
            </div>
            <div>
              <label className="label">BNFM %</label>
              <NumberInput value={draft.bnfm_pct}
                onChange={(v) => set("bnfm_pct", v)} />
              <p className="mt-1 text-xs text-slate-500">Broken Kernels and Foreign Material.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={draft.non_tannin_sorghum}
                onChange={(e) => set("non_tannin_sorghum", e.target.checked)} />
              Non-Tannin / White Sorghum
            </label>
          </>
        )}
      </div>

      <div className="mt-5">
        <label className="label">State(s)</label>
        <ChipMultiSelect
          options={US_STATES}
          selected={draft.locations.map((l) => l.state)}
          onChange={toggleLocationState}
        />
        {draft.locations.map((loc: OfferLocation) => (
          <CountyPicker
            key={loc.state}
            state={loc.state}
            selected={loc.counties}
            onChange={(counties) => setLocationCounties(loc.state, counties)}
          />
        ))}
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label className="label">Sustainability Attributes</label>
          <ChipMultiSelect options={sustainabilityAttributes.labels} titles={sustainabilityAttributes.titles} selected={draft.sustainability_attributes}
            onChange={(v) => set("sustainability_attributes", v)} />
          <AttributeRequestLink type="attribute" />
        </div>
        {!commodityHasDefaultPractices && (
          <div>
            <label className="label">Conservation Practices</label>
            <ChipMultiSelect options={practices.labels} titles={practices.titles}
              selected={draft.override_conservation_practices ?? []}
              onChange={(v) => set("override_conservation_practices", v)} />
            <p className="mt-1 text-xs text-slate-500">
              {draft.commodity
                ? `You haven't set ${draft.commodity} defaults yet (Production Data tab) — picked here for this listing.`
                : "Select a crop above — if it has saved defaults (Production Data tab), this moves under “differs from defaults” instead."}
            </p>
            <AttributeRequestLink type="practice" />
          </div>
        )}
        <div>
          <label className="label">Specialty Attributes</label>
          <ChipMultiSelect options={specialtyAttributes.labels} titles={specialtyAttributes.titles} selected={draft.specialty_attributes}
            onChange={(v) => set("specialty_attributes", v)} />
        </div>
        <div>
          <label className="label">Certifications</label>
          <ChipMultiSelect options={certifications.labels} titles={certifications.titles} selected={draft.certifications}
            onChange={(v) => set("certifications", v)} />
          <AttributeRequestLink type="certification" />
        </div>
      </div>

      <div className="mt-5 border-t border-brand-edge pt-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" checked={overrideProduction} onChange={(e) => toggleOverride(e.target.checked)} />
          This listing's practices differ from my usual {draft.commodity || "crop"} defaults
        </label>
        <p className="mt-1 text-xs text-slate-500">
          By default, buyers see your saved {draft.commodity || "crop"} production data (Production
          Data tab). Check this only if this specific lot is different — you can attach this lot's
          own soil test or verification statement below.
        </p>

        {overrideProduction && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Actual Yield</label>
              <div className="flex gap-2">
                <NumberInput value={draft.override_actual_yield_per_acre}
                  onChange={(v) => set("override_actual_yield_per_acre", v)} />
                <select className="field" value={draft.override_yield_unit}
                  onChange={(e) => set("override_yield_unit", e.target.value as YieldUnit | "")}>
                  <option value="">Unit</option>
                  <option value="bu/acre">bu/acre</option>
                  <option value="MT/acre">MT/acre</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Irrigation Type</label>
              <select className="field" value={draft.override_irrigation_type}
                onChange={(e) => set("override_irrigation_type", e.target.value as OfferDraft["override_irrigation_type"])}>
                <option value="">Select type</option>
                <option value="dryland">Dryland</option>
                <option value="rainfed">Rainfed</option>
                <option value="irrigated">Irrigated</option>
              </select>
            </div>
            <div>
              <label className="label">Crop Rotation</label>
              <div className="flex items-center gap-2">
                <NumberInput aria-label="Number of crops" placeholder="Crops" value={draft.override_crop_rotation_crops}
                  onChange={(v) => set("override_crop_rotation_crops", v)} />
                <span className="shrink-0 text-sm text-slate-500">crops over</span>
                <NumberInput aria-label="Number of years" placeholder="Years" value={draft.override_crop_rotation_years}
                  onChange={(v) => set("override_crop_rotation_years", v)} />
                <span className="shrink-0 text-sm text-slate-500">yrs</span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Input Usage Notes</label>
              <textarea className="field" rows={2} value={draft.override_input_usage_notes}
                onChange={(e) => set("override_input_usage_notes", e.target.value)} />
            </div>
            {commodityHasDefaultPractices && (
              <div className="sm:col-span-2">
                <label className="label">Conservation Practices (for this lot)</label>
                <ChipMultiSelect options={practices.labels} titles={practices.titles}
                  selected={draft.override_conservation_practices ?? []}
                  onChange={(v) => set("override_conservation_practices", v)} />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!draft.override_soil_test_on_file}
                onChange={(e) => set("override_soil_test_on_file", e.target.checked)} />
              Soil test on file (for this lot)
            </label>
            <div>
              <label className="label">Soil test document</label>
              {soilTestFile ? (
                <div className="mt-1 flex items-center gap-3 text-sm">
                  <span className="text-slate-700">{soilTestFile.name}</span>
                  <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={() => setSoilTestFile(null)}>Remove</button>
                </div>
              ) : (
                <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="mt-1 text-sm"
                  onChange={(e) => setSoilTestFile(e.target.files?.[0] ?? null)} />
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!draft.override_third_party_verified}
                onChange={(e) => set("override_third_party_verified", e.target.checked)} />
              Third-party verified (for this lot)
            </label>
            <div>
              <label className="label">Third-party verification statement</label>
              {verificationFile ? (
                <div className="mt-1 flex items-center gap-3 text-sm">
                  <span className="text-slate-700">{verificationFile.name}</span>
                  <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={() => setVerificationFile(null)}>Remove</button>
                </div>
              ) : (
                <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="mt-1 text-sm"
                  onChange={(e) => setVerificationFile(e.target.files?.[0] ?? null)} />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-brand-edge pt-4">
        <label className="label">Additional Documents</label>
        <p className="mt-1 text-xs text-slate-500">
          Attach any documents buyers may want to see (e.g. "Non-GMO Certificate", "Export Permit") —
          more can be added later from My Listings.
        </p>
        {stagedDocuments.length > 0 && (
          <div className="mt-2 space-y-1">
            {stagedDocuments.map((doc, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-slate-700">{doc.label}</span>
                <span className="text-xs text-slate-400">{doc.category === "certification" ? "Certification" : "General"}</span>
                <span className="text-xs text-slate-400">{doc.file.name}</span>
                <button type="button" className="text-xs text-slate-500 hover:text-red-600"
                  onClick={() => setStagedDocuments((docs) => docs.filter((_, idx) => idx !== i))}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input className="field" placeholder='Document type (e.g. "Non-GMO Certificate")'
            value={newDocLabel} onChange={(e) => setNewDocLabel(e.target.value)} />
          <div className="flex gap-3">
            {(["general", "certification"] as OfferDocumentCategory[]).map((c) => (
              <label key={c} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="radio" name="new-doc-category" checked={newDocCategory === c} onChange={() => setNewDocCategory(c)} />
                {c === "general" ? "General" : "Certification"}
              </label>
            ))}
          </div>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            className="text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && newDocLabel.trim()) {
                setStagedDocuments((docs) => [...docs, { file, label: newDocLabel.trim(), category: newDocCategory }]);
                setNewDocLabel("");
                setNewDocCategory("general");
                e.target.value = "";
              }
            }}
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        {!onBehalfOf && (
          <button type="button" className="btn-ghost" disabled={!!submitting} onClick={() => submit("draft")}>
            {submitting === "draft" ? "Saving…" : "Save Draft"}
          </button>
        )}
        <button type="button" className="btn-primary" disabled={!!submitting} onClick={requestPublish}>
          {submitting === "published" ? (onBehalfOf ? "Sending…" : "Publishing…") : onBehalfOf ? "Submit for Grower Approval" : "Review & Publish"}
        </button>
      </div>

      {showConfirm && (
        <ReviewDialog
          title="Review your listing before publishing"
          message="This is how buyers will see it on the Marketplace. Please confirm everything is accurate — changes after publishing may require re-approval or withdrawal."
          confirmLabel={onBehalfOf ? "Submit for Approval" : "Publish"}
          busy={submitting === "published"}
          onConfirm={() => submit("published")}
          onCancel={() => setShowConfirm(false)}
        >
          <SupplyOfferCard offer={previewOffer()} preview responded={false} responding={false} onRespond={() => {}} />
          <SummaryRows rows={[
            ["Listed for", !forOperator ? "" : aggregating
              ? `Aggregated: ${aggregateRows.map(([id, v]) => `${growerName(id)} (${formatNumber(Number(v))} ${draft.uom})`).join(", ")}${ownContribution ? ` + your own ${formatNumber(Number(ownContribution))} ${draft.uom}` : ""}`
              : selectedGrower ? `${selectedGrower.grower_name || "Enrolled grower"} (awaits their approval)` : "My own grain"],
            ["Offering", OFFERING_CHOICES.find((c) => c.id === offeringChoice)?.label],
            ["Marketing Year", draft.marketing_year],
            ["Area", draft.acres_offered ? `${formatNumber(Number(draft.acres_offered))} ${draft.area_unit}` : ""],
            ["Yield Rate", draft.yield_rate ? `${formatNumber(Number(draft.yield_rate))} ${draft.yield_unit}` : ""],
            ["Price Type", draft.price_type],
            ["Desired Price", draft.desired_price ? `${formatCurrency(Number(draft.desired_price))}/${draft.uom === "bushels" ? "bushel" : "MT"}` : ""],
            ["Harvest Window", draft.harvest_start || draft.harvest_end ? `${draft.harvest_start || "—"} – ${draft.harvest_end || "—"}` : ""],
            ["Conservation Practices", (draft.override_conservation_practices ?? []).join(", ")],
            ["Documents", [
              ...stagedDocuments.map((d) => d.label),
              soilTestFile && "Soil test",
              verificationFile && "Third-party verification",
            ].filter(Boolean).join(", ")],
          ]} />
        </ReviewDialog>
      )}
    </div>
  );
}

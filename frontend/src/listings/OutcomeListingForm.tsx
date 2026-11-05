import { useState } from "react";
import { api } from "../api";
import { ChipMultiSelect, DateRangeField, MultiSelectDropdown, NumberInput, ReviewDialog, SummaryRows, dateRangeError } from "../ui";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import AttributeRequestLink from "../AttributeRequestLink";
import { useVerification } from "../profile/VerificationPrompt";
import { COMMODITY_GROUPS, PRICING_INFLUENCES, US_STATES } from "../constants";
import type { Bid, Offer, OutcomeType } from "../types";
import BidCard from "./BidCard";
import SupplyOfferCard from "./SupplyOfferCard";
import { ASSET_CLASS_LABELS, outcomeByType, outcomesFor, vintageYearOptions } from "./environmental";
import { formatCurrency } from "../format";

const ALL_CROPS = COMMODITY_GROUPS.flatMap((g) => g.items);

/**
 * Create a carbon or environmental-data listing — an RFQ (side="bid", buyers) or an offer
 * (side="offer", growers/operators). Modeled on meti-v2's Match page: one outcome per listing,
 * a quantity in that outcome's unit, a per-unit price, vintage years, and optional source
 * geography, crops, practices and standards. See listings/environmental.ts.
 */
export default function OutcomeListingForm({ side, assetClass, onCreated }: {
  side: "bid" | "offer";
  assetClass: "carbon" | "environmental";
  /** `notice` confirms what happened — callers that close the form should show it themselves. */
  onCreated: (notice?: string) => void;
}) {
  const outcomes = outcomesFor(assetClass);
  const [outcomeType, setOutcomeType] = useState<OutcomeType>(outcomes[0]!.type);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [vintageYears, setVintageYears] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [crops, setCrops] = useState<string[]>([]);
  const [methodology, setMethodology] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selectedPractices, setSelectedPractices] = useState<string[]>([]);
  const [selectedCertifications, setSelectedCertifications] = useState<string[]>([]);
  const [selectedDataRequirements, setSelectedDataRequirements] = useState<string[]>([]);
  const [dataAttributes, setDataAttributes] = useState<string[]>([]);
  const [allowPartial, setAllowPartial] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"draft" | "live" | null>(null);
  const [showReview, setShowReview] = useState(false);
  const practices = useTaxonomyTerms("practice");
  const certifications = useTaxonomyTerms("certification");
  const dataRequirements = useTaxonomyTerms("data_requirement");
  const { requireVerified } = useVerification();

  const outcome = outcomeByType(outcomeType) ?? outcomes[0]!;
  const isBid = side === "bid";
  const noun = isBid ? "RFQ" : "offer";

  const validate = (): string | null => {
    if (!quantity || Number(quantity) <= 0) return "Quantity is required";
    if (vintageYears.length === 0) return "Select at least one vintage year";
    if (price !== "" && Number(price) < 0) return "Price can't be negative";
    return dateRangeError(start, end, "Delivery Window");
  };

  const shared = () => ({
    asset_class: assetClass, outcome_type: outcomeType, vintage_years: vintageYears,
    source_states: states, source_commodities: crops, methodology,
    delivery_window_start: start, delivery_window_end: end,
  });

  const now = new Date().toISOString();
  const previewBid = (): Bid => ({
    ...shared(),
    id: "preview", created_by: "", on_behalf_of_buyer_account_id: null, buyer_approval_status: "not_required",
    commodity: outcome.label, variety: null, bid_type: "environmental_outcome", quantity: Number(quantity),
    area_unit: null, bid_price_usd_per_mt: price === "" ? null : Number(price),
    delivery_window_start: start || null, delivery_window_end: end || null,
    required_attributes: [], required_practices: selectedPractices, required_certifications: selectedCertifications,
    required_data_requirements: selectedDataRequirements, required_attribute_notes: {}, allow_partial: allowPartial,
    destination_country: null, status: "open", created_at: now, updated_at: now, has_active_negotiation: false,
    remaining_quantity: Number(quantity), methodology: methodology || null,
  });
  const previewOffer = (): Offer => ({
    ...shared(),
    id: "preview", created_by: "", on_behalf_of_grower_account_id: null, grower_approval_status: "not_required",
    commodity: outcome.label, variety: null, marketing_year: vintageYears[0] ?? null, quantity_basis: "outcome",
    listing_timing: "available", delivery_window_start: start || null, delivery_window_end: end || null,
    expected_volume: Number(quantity), uom: outcome.unit, acres_offered: null, area_unit: null, yield_rate: null,
    yield_unit: null, price_type: price === "" ? null : "fixed", desired_price: price === "" ? null : Number(price),
    protein_pct: null, moisture_pct_max: null, test_weight: null, bcfm_pct: null, seed_variety: null,
    tannin_level_max: null, non_tannin_sorghum: false, bnfm_pct: null, min_order: minOrder === "" ? null : Number(minOrder),
    harvest_start: null, harvest_end: null, sustainability_attributes: [], specialty_attributes: [],
    locations: states.map((s) => ({ state: s, counties: [] })), certifications: selectedCertifications,
    status: "published", created_at: now, updated_at: now, has_active_negotiation: false,
    remaining_volume: Number(quantity), aggregate_growers: [], data_attributes: dataAttributes,
    production: {
      actual_yield_per_acre: null, yield_unit: null, irrigation_type: null, crop_rotation_years: null,
      crop_rotation_crops: null, soil_test_on_file: false, third_party_verified: false, input_usage_notes: null,
      conservation_practices: selectedPractices, has_override: selectedPractices.length > 0, has_default: false,
      has_verification_document: false, verification_document_url: null, has_soil_test_document: false,
      soil_test_document_url: null, show_advanced_in_listing: false,
    },
    methodology: methodology || null,
  });

  const requestPublish = () => {
    if (!requireVerified(`publish an ${noun}`)) return;
    const err = validate();
    if (err) return setError(err);
    setError(null);
    setShowReview(true);
  };

  const submit = async (mode: "draft" | "live") => {
    const err = validate();
    if (err) return setError(err);
    setError(null);
    setSubmitting(mode);
    try {
      if (isBid) {
        await api.createOutcomeBid({
          ...shared(), quantity, bid_price_usd_per_mt: price, required_practices: selectedPractices,
          required_certifications: selectedCertifications, required_data_requirements: selectedDataRequirements,
          allow_partial: allowPartial, status: mode === "draft" ? "draft" : "open",
        });
      } else {
        await api.createOutcomeOffer({
          ...shared(), expected_volume: quantity, desired_price: price, min_order: minOrder,
          practices: selectedPractices, certifications: selectedCertifications, data_attributes: dataAttributes,
          status: mode === "draft" ? "draft" : "published",
        });
      }
      setShowReview(false);
      onCreated(mode === "draft"
        ? `${outcome.label} ${noun} saved as a draft — publish it from Your Listings when you're ready.`
        : `${outcome.label} ${noun} published — it's now live on the Marketplace.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-slate-900">
        {isBid ? "Create" : "List"} {ASSET_CLASS_LABELS[assetClass]} {isBid ? "RFQ" : "Offer"}
      </h2>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Outcome *</label>
          <select className="field" value={outcomeType} onChange={(e) => setOutcomeType(e.target.value as OutcomeType)}>
            {outcomes.map((o) => <option key={o.type} value={o.type}>{o.label} ({o.unit})</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">{outcome.description}</p>
        </div>
        <div>
          <label className="label">Quantity ({outcome.unit}) *</label>
          <NumberInput value={quantity} onChange={setQuantity} />
        </div>
        <div>
          <label className="label">{isBid ? "Bid Price" : "Asking Price"} ($/{outcome.unit})</label>
          <NumberInput value={price} onChange={setPrice} />
        </div>
        {!isBid && (
          <div>
            <label className="label">Minimum Purchase ({outcome.unit})</label>
            <NumberInput value={minOrder} onChange={setMinOrder} />
          </div>
        )}
        <div>
          <label className="label">Methodology / Registry</label>
          <input className="field" maxLength={200} placeholder="e.g. Verra VM0042, Field to Market"
            value={methodology} onChange={(e) => setMethodology(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Vintage Year(s) *</label>
          <ChipMultiSelect options={vintageYearOptions()} selected={vintageYears} onChange={setVintageYears} />
        </div>
        <div>
          <label className="label">Source State(s)</label>
          <MultiSelectDropdown label="States" options={US_STATES} selected={states} onChange={setStates} />
        </div>
        <div>
          <label className="label">Associated Crop(s)</label>
          <MultiSelectDropdown label="Crops" options={ALL_CROPS} selected={crops} onChange={setCrops} />
        </div>
        <DateRangeField className="sm:col-span-2" label="Delivery Window"
          start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
      </div>

      {isBid && (
        <div className="mt-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={!allowPartial} onChange={(e) => setAllowPartial(!e.target.checked)} />
            Require full amount only (no partial responses)
          </label>
        </div>
      )}

      <div className="mt-5 space-y-4">
        <div>
          <label className="label">{isBid ? "Required Practices" : "Practices"}</label>
          <ChipMultiSelect options={practices.labels} titles={practices.titles} selected={selectedPractices} onChange={setSelectedPractices} />
          <AttributeRequestLink type="practice" />
        </div>
        <div>
          <label className="label">{isBid ? "Required Standards / Certifications" : "Standards / Certifications"}</label>
          <ChipMultiSelect options={certifications.labels} titles={certifications.titles} selected={selectedCertifications} onChange={setSelectedCertifications} />
          <AttributeRequestLink type="certification" />
        </div>
        {isBid ? (
          <div>
            <label className="label">Specific Data Requirements</label>
            <ChipMultiSelect options={dataRequirements.labels} titles={dataRequirements.titles} selected={selectedDataRequirements} onChange={setSelectedDataRequirements} />
            <AttributeRequestLink type="data_requirement" />
          </div>
        ) : (
          <div>
            <label className="label">What's Included</label>
            <ChipMultiSelect options={PRICING_INFLUENCES} selected={dataAttributes} onChange={setDataAttributes} />
            <p className="mt-1 text-xs text-slate-500">Factors that affect pricing, e.g. traceability or multi-year data.</p>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button type="button" className="btn-ghost" disabled={!!submitting} onClick={() => submit("draft")}>
          {submitting === "draft" ? "Saving…" : "Save Draft"}
        </button>
        <button type="button" className="btn-primary" disabled={!!submitting} onClick={requestPublish}>
          Review &amp; Publish {isBid ? "RFQ" : "Offer"}
        </button>
      </div>

      {showReview && (
        <ReviewDialog
          title={`Review your ${noun} before publishing`}
          message={`This is how ${isBid ? "sellers" : "buyers"} will see it on the Marketplace. Please confirm everything is accurate.`}
          confirmLabel={isBid ? "Publish RFQ" : "Publish Offer"}
          busy={submitting === "live"}
          onConfirm={() => submit("live")}
          onCancel={() => setShowReview(false)}
        >
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          {isBid
            ? <BidCard bid={previewBid()} preview responded={false} responding={false} onRespond={() => {}} />
            : <SupplyOfferCard offer={previewOffer()} preview responded={false} responding={false} onRespond={() => {}} />}
          <SummaryRows rows={[
            ["Price", price ? `${formatCurrency(Number(price))}/${outcome.unit}` : "Open to offers"],
            ["Partial responses", isBid ? (allowPartial ? "Allowed" : "Full amount only") : ""],
          ]} />
        </ReviewDialog>
      )}
    </div>
  );
}

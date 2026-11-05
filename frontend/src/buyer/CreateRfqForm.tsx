import { useEffect, useState } from "react";
import { api } from "../api";
import { ChipMultiSelect, DateRangeField, NumberInput, ReviewDialog, SummaryRows, dateRangeError } from "../ui";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import AttributeRequestLink from "../AttributeRequestLink";
import { toAcres } from "../units";
import type { AreaUnit, Bid, BidType, ProgramOperatorOption } from "../types";
import BidCard from "../listings/BidCard";
import { useVerification } from "../profile/VerificationPrompt";
import { COMMODITY_VARIETIES, GRAIN_COMMODITIES } from "../listings/constants";
import { COUNTRIES } from "../constants";

const BID_TYPES = [
  { value: "available_grain", label: "Available Grain" },
  { value: "acres_for_contracting", label: "Acres for Contracting" },
  { value: "volumes_for_contracting", label: "Volumes for Contracting" },
] as const;
const AREA_UNITS: AreaUnit[] = ["acres", "hectares"];

export default function CreateRfqForm({ onCreated, forServiceProvider }: {
  /** `notice` confirms what just happened (e.g. saved as a draft) — callers that close this form
   * on success should show it themselves, since this form's own copy unmounts with it. */
  onCreated: (notice?: string) => void;
  forServiceProvider?: boolean;
}) {
  const [commodity, setCommodity] = useState("");
  const [variety, setVariety] = useState("");
  const [bidType, setBidType] = useState<string>("available_grain");
  const [quantity, setQuantity] = useState("");
  const [areaUnit, setAreaUnit] = useState<AreaUnit>("acres");
  const [price, setPrice] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>([]);
  const [attributeNotes, setAttributeNotes] = useState<Record<string, string>>({});
  const [selectedPractices, setSelectedPractices] = useState<string[]>([]);
  const [selectedCertifications, setSelectedCertifications] = useState<string[]>([]);
  const [selectedDataRequirements, setSelectedDataRequirements] = useState<string[]>([]);
  const [allowPartial, setAllowPartial] = useState(true);
  const [country, setCountry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"draft" | "open" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sustainabilityAttributes = useTaxonomyTerms("attribute", "sustainability");
  const specialtyAttributes = useTaxonomyTerms("attribute", "specialty");
  const practices = useTaxonomyTerms("practice");
  const certifications = useTaxonomyTerms("certification");
  const dataRequirements = useTaxonomyTerms("data_requirement");
  // Service-provider-only: which represented buyer this bid is placed for. No cap on quantity
  // (buyers have no "enrolled volume" concept the way growers have enrolled acres) — just
  // requires an active representation, enforced server-side.
  const [buyers, setBuyers] = useState<ProgramOperatorOption[]>([]);
  const [onBehalfOf, setOnBehalfOf] = useState("");

  useEffect(() => {
    if (forServiceProvider) api.activeBuyersForBids().then((r) => setBuyers(r.buyers)).catch(() => setBuyers([]));
  }, [forServiceProvider]);

  const setAttributeNote = (label: string, note: string) =>
    setAttributeNotes((n) => ({ ...n, [label]: note }));

  const toggleAttribute = (next: string[]) => {
    setSelectedAttributes(next);
    // Drop notes for attributes that got deselected, so a stale note doesn't silently resurface
    // if the same attribute is picked again later.
    setAttributeNotes((n) => {
      const kept: Record<string, string> = {};
      for (const label of next) if (n[label]) kept[label] = n[label];
      return kept;
    });
  };

  // Each segment's ChipMultiSelect only knows its own pool of options, so its onChange gives the
  // full next-selection within that pool only — merge back in whatever's currently selected from
  // the OTHER segment before writing to the single flat required_attributes array the bid stores.
  const toggleAttributeInSegment = (segmentLabels: string[], nextForSegment: string[]) => {
    const keptFromOtherSegment = selectedAttributes.filter((a) => !segmentLabels.includes(a));
    toggleAttribute([...keptFromOtherSegment, ...nextForSegment]);
  };

  const [showReview, setShowReview] = useState(false);
  const { requireVerified } = useVerification();

  const validate = (): string | null => {
    if (!commodity) return "Commodity is required";
    if (!quantity || Number(quantity) <= 0) return "Quantity is required";
    if (forServiceProvider && !onBehalfOf) return "Select which buyer this bid is for";
    return dateRangeError(start, end, "Delivery Window");
  };

  const requestPublish = () => {
    if (!requireVerified("publish an RFQ")) return;
    const err = validate();
    if (err) return setError(err);
    setError(null);
    setShowReview(true);
  };

  // Quantity is stored normalized to acres for an acres bid — see submit().
  const normalizedQuantity = () => bidType === "acres_for_contracting"
    ? String(toAcres(Number(quantity), areaUnit))
    : quantity;

  /** The draft shaped as the Bid the marketplace card renders, for the pre-publish review. */
  const previewBid = (): Bid => {
    const now = new Date().toISOString();
    const qty = Number(normalizedQuantity());
    return {
      id: "preview", created_by: "", on_behalf_of_buyer_account_id: onBehalfOf || null, buyer_approval_status: "approved",
      commodity, variety: variety || null, bid_type: bidType as BidType, quantity: qty,
      area_unit: bidType === "acres_for_contracting" ? areaUnit : null,
      bid_price_usd_per_mt: price === "" ? null : Number(price),
      delivery_window_start: start || null, delivery_window_end: end || null,
      required_attributes: selectedAttributes, required_practices: selectedPractices,
      required_certifications: selectedCertifications, required_data_requirements: selectedDataRequirements,
      required_attribute_notes: attributeNotes, allow_partial: allowPartial, destination_country: country || null,
      status: "open", created_at: now, updated_at: now, has_active_negotiation: false, remaining_quantity: qty,
    };
  };

  const submit = async (status: "draft" | "open" = "open") => {
    const err = validate();
    if (err) return setError(err);
    setError(null);
    setNotice(null);
    setSubmitting(status);
    try {
      // Normalized to acres before storage (same convention as offers.acres_offered) —
      // area_unit is kept purely for redisplaying what the buyer originally typed.
      await api.createBid({
        commodity, variety, bid_type: bidType, quantity: normalizedQuantity(),
        area_unit: bidType === "acres_for_contracting" ? areaUnit : undefined,
        bid_price_usd_per_mt: price,
        delivery_window_start: start, delivery_window_end: end,
        required_attributes: selectedAttributes, required_practices: selectedPractices,
        required_certifications: selectedCertifications, required_data_requirements: selectedDataRequirements,
        required_attribute_notes: attributeNotes, allow_partial: allowPartial,
        destination_country: country, on_behalf_of_buyer_account_id: onBehalfOf || undefined,
        status,
      });
      setOnBehalfOf("");
      setShowReview(false);
      const createdNotice = status === "draft"
        ? "RFQ saved as a draft — it isn't visible to sellers yet. Publish it from Your Listings when you're ready."
        : "RFQ published — it's now live on the Marketplace.";
      setNotice(createdNotice);
      onCreated(createdNotice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-slate-900">Create RFQ</h2>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-2 text-sm text-emerald-700">{notice}</p>}

      {forServiceProvider && (
        <div className="mt-4 rounded-lg border border-brand-edge p-3">
          <label className="label">Place this bid for *</label>
          <select className="field" value={onBehalfOf} onChange={(e) => setOnBehalfOf(e.target.value)}>
            <option value="">Select a represented buyer</option>
            {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {buyers.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">
              You don't represent any buyers yet — request representation from the Buyers tab first.
            </p>
          )}
          {onBehalfOf && (
            <p className="mt-1 text-xs text-slate-500">This bid won't be listed until the buyer approves it.</p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Commodity *</label>
          <select className="field" value={commodity}
            onChange={(e) => { setCommodity(e.target.value); setVariety(""); }}>
            <option value="">Select commodity</option>
            {GRAIN_COMMODITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Variety / Class</label>
          <select className="field" value={variety} disabled={!COMMODITY_VARIETIES[commodity]}
            onChange={(e) => setVariety(e.target.value)}>
            <option value="">{COMMODITY_VARIETIES[commodity] ? "Select variety" : "No varieties for this crop"}</option>
            {(COMMODITY_VARIETIES[commodity] ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Bid Type</label>
          <select className="field" value={bidType} onChange={(e) => setBidType(e.target.value)}>
            {BID_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Quantity ({bidType === "acres_for_contracting" ? "area" : "MT"}) *</label>
          {bidType === "acres_for_contracting" ? (
            <div className="flex gap-2">
              <NumberInput value={quantity} onChange={(v) => setQuantity(v)} />
              <select className="field" value={areaUnit} onChange={(e) => setAreaUnit(e.target.value as AreaUnit)}>
                {AREA_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          ) : (
            <NumberInput value={quantity} onChange={(v) => setQuantity(v)} />
          )}
        </div>
        <div>
          <label className="label">Bid Price ($/MT)</label>
          <NumberInput value={price} onChange={(v) => setPrice(v)} />
        </div>
        <DateRangeField className="sm:col-span-2" label="Delivery Window"
          start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
        <div>
          <label className="label">Destination Country</label>
          <select className="field" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Select country</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={!allowPartial} onChange={(e) => setAllowPartial(!e.target.checked)} />
          Require full amount only (no partial responses)
        </label>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label className="label">Required Sustainability Attributes</label>
          <ChipMultiSelect
            options={sustainabilityAttributes.labels} titles={sustainabilityAttributes.titles}
            selected={selectedAttributes.filter((a) => sustainabilityAttributes.labels.includes(a))}
            onChange={(next) => toggleAttributeInSegment(sustainabilityAttributes.labels, next)}
          />
        </div>
        <div>
          <label className="label">Required Specialty Attributes</label>
          <ChipMultiSelect
            options={specialtyAttributes.labels} titles={specialtyAttributes.titles}
            selected={selectedAttributes.filter((a) => specialtyAttributes.labels.includes(a))}
            onChange={(next) => toggleAttributeInSegment(specialtyAttributes.labels, next)}
          />
          {selectedAttributes.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {selectedAttributes.map((label) => (
                <input
                  key={label}
                  className="field text-xs"
                  placeholder={`Describe your "${label}" requirement (optional)`}
                  value={attributeNotes[label] || ""}
                  onChange={(e) => setAttributeNote(label, e.target.value)}
                />
              ))}
            </div>
          )}
          <AttributeRequestLink type="attribute" />
        </div>
        <div>
          <label className="label">Required Practices</label>
          <ChipMultiSelect options={practices.labels} titles={practices.titles} selected={selectedPractices} onChange={setSelectedPractices} />
          <AttributeRequestLink type="practice" />
        </div>
        <div>
          <label className="label">Required Certifications</label>
          <ChipMultiSelect options={certifications.labels} titles={certifications.titles} selected={selectedCertifications} onChange={setSelectedCertifications} />
          <AttributeRequestLink type="certification" />
        </div>
        <div>
          <label className="label">Specific Data Requirements</label>
          <ChipMultiSelect options={dataRequirements.labels} titles={dataRequirements.titles} selected={selectedDataRequirements} onChange={setSelectedDataRequirements} />
          <p className="mt-1 text-xs text-slate-500">
            Not yet used for matching — negotiate the details with the grower directly once you're in a conversation.
          </p>
          <AttributeRequestLink type="data_requirement" />
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        {!forServiceProvider && (
          <button type="button" className="btn-ghost" disabled={!!submitting} onClick={() => submit("draft")}>
            {submitting === "draft" ? "Saving…" : "Save Draft"}
          </button>
        )}
        <button type="button" className="btn-primary" disabled={!!submitting} onClick={requestPublish}>
          {forServiceProvider ? "Review & Submit for Buyer Approval" : "Review & Publish RFQ"}
        </button>
      </div>

      {showReview && (
        <ReviewDialog
          title="Review your RFQ before publishing"
          message="This is how growers will see it on the Marketplace. Please confirm everything is accurate."
          confirmLabel={forServiceProvider ? "Submit for Approval" : "Publish RFQ"}
          busy={submitting === "open"}
          onConfirm={() => submit("open")}
          onCancel={() => setShowReview(false)}
        >
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <BidCard bid={previewBid()} preview responded={false} responding={false} onRespond={() => {}} />
          <SummaryRows rows={[
            ["Placed for", buyers.find((b) => b.id === onBehalfOf)?.name ?? ""],
            ["Partial responses", allowPartial ? "Allowed" : "Full amount only"],
            ...Object.entries(attributeNotes).filter(([, n]) => n).map(([a, n]) => [`"${a}" requirement`, n] as [string, string]),
          ]} />
        </ReviewDialog>
      )}
    </div>
  );
}

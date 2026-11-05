import { useState } from "react";
import { api } from "../api";
import { ChipMultiSelect, DateRangeField, NumberInput, dateRangeError } from "../ui";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import AttributeRequestLink from "../AttributeRequestLink";
import type { Bid } from "../types";
import { COMMODITY_VARIETIES } from "../listings/constants";
import { COUNTRIES } from "../constants";
import { bidUnit, isOutcomeListing } from "../listings/environmental";

/** Only the fields bids_routes.py's EDITABLE_BID_FIELDS allows through PATCH — commodity,
 * bid_type, and quantity are permanently immutable once a bid is posted (close + repost
 * instead), so this form never shows them. */
export default function BidEditForm({ bid, onSaved, onCancel }: {
  bid: Bid;
  onSaved: (next: Bid) => void;
  onCancel: () => void;
}) {
  const [variety, setVariety] = useState(bid.variety ?? "");
  const [price, setPrice] = useState(bid.bid_price_usd_per_mt?.toString() ?? "");
  const [start, setStart] = useState(bid.delivery_window_start ?? "");
  const [end, setEnd] = useState(bid.delivery_window_end ?? "");
  const [selectedAttributes, setSelectedAttributes] = useState(bid.required_attributes);
  const [attributeNotes, setAttributeNotes] = useState<Record<string, string>>(bid.required_attribute_notes ?? {});
  const [selectedPractices, setSelectedPractices] = useState(bid.required_practices);
  const [selectedCertifications, setSelectedCertifications] = useState(bid.required_certifications);
  const [selectedDataRequirements, setSelectedDataRequirements] = useState(bid.required_data_requirements);
  const [allowPartial, setAllowPartial] = useState(bid.allow_partial);
  const [country, setCountry] = useState(bid.destination_country ?? "");
  const [methodology, setMethodology] = useState(bid.methodology ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Carbon / environmental-data RFQs have no variety, destination or grain attributes.
  const outcome = isOutcomeListing(bid);

  const sustainabilityAttributes = useTaxonomyTerms("attribute", "sustainability");
  const specialtyAttributes = useTaxonomyTerms("attribute", "specialty");
  const practices = useTaxonomyTerms("practice");
  const certifications = useTaxonomyTerms("certification");
  const dataRequirements = useTaxonomyTerms("data_requirement");

  const setAttributeNote = (label: string, note: string) =>
    setAttributeNotes((n) => ({ ...n, [label]: note }));

  const toggleAttribute = (next: string[]) => {
    setSelectedAttributes(next);
    setAttributeNotes((n) => {
      const kept: Record<string, string> = {};
      for (const label of next) if (n[label]) kept[label] = n[label];
      return kept;
    });
  };

  const toggleAttributeInSegment = (segmentLabels: string[], nextForSegment: string[]) => {
    const keptFromOtherSegment = selectedAttributes.filter((a) => !segmentLabels.includes(a));
    toggleAttribute([...keptFromOtherSegment, ...nextForSegment]);
  };

  const save = async () => {
    const rangeErr = dateRangeError(start, end, "Delivery Window");
    if (rangeErr) return setError(rangeErr);
    setError(null);
    setSaving(true);
    try {
      const { bid: updated } = await api.updateBid(bid.id, outcome ? {
        bid_price_usd_per_mt: price, methodology,
        delivery_window_start: start || null, delivery_window_end: end || null,
        required_practices: selectedPractices, required_certifications: selectedCertifications,
        required_data_requirements: selectedDataRequirements, allow_partial: allowPartial,
      } : {
        variety, bid_price_usd_per_mt: price,
        delivery_window_start: start || null, delivery_window_end: end || null,
        required_attributes: selectedAttributes, required_practices: selectedPractices,
        required_certifications: selectedCertifications, required_data_requirements: selectedDataRequirements,
        required_attribute_notes: attributeNotes, destination_country: country || null,
        allow_partial: allowPartial,
      });
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-brand-edge bg-brand-bg/50 p-4">
      <h4 className="text-sm font-semibold text-slate-900">Edit Listing</h4>
      <p className="text-xs text-slate-500">
        Commodity, bid type, and quantity can't be changed here — close and repost for those.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {outcome ? (
          <div>
            <label className="label">Methodology / Registry</label>
            <input className="field" maxLength={200} value={methodology} onChange={(e) => setMethodology(e.target.value)} />
          </div>
        ) : <div>
          <label className="label">Variety / Class</label>
          <select className="field" value={variety} disabled={!COMMODITY_VARIETIES[bid.commodity]}
            onChange={(e) => setVariety(e.target.value)}>
            <option value="">{COMMODITY_VARIETIES[bid.commodity] ? "Select variety" : "No varieties for this crop"}</option>
            {(COMMODITY_VARIETIES[bid.commodity] ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>}
        <div>
          <label className="label">Bid Price ($/{isOutcomeListing(bid) ? bidUnit(bid) : "MT"})</label>
          <NumberInput value={price} onChange={(v) => setPrice(v)} />
        </div>
        <DateRangeField className="sm:col-span-2" label="Delivery Window"
          start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
        {!outcome && <div>
          <label className="label">Destination Country</label>
          <select className="field" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Select country</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>}
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={!allowPartial} onChange={(e) => setAllowPartial(!e.target.checked)} />
          Require full amount only (no partial responses)
        </label>
      </div>

      <div className="space-y-3">
        {!outcome && <>
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
        </>}
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
          <AttributeRequestLink type="data_requirement" />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-ghost" disabled={saving} onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Changes"}</button>
      </div>
    </div>
  );
}

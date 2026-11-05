import { useState } from "react";
import { api } from "../api";
import { US_STATES } from "../constants";
import { ChipMultiSelect, DateRangeField, NumberInput, dateRangeError } from "../ui";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import AttributeRequestLink from "../AttributeRequestLink";
import { CountyPicker } from "./OfferForm";
import type { Offer, OfferLocation, PriceType } from "../types";
import { COMMODITY_VARIETIES, PRICE_TYPE_OPTIONS } from "./constants";
import { isOutcomeListing, offerPriceUnit } from "./environmental";

/** Only the fields offers_routes.py's EDITABLE_OFFER_FIELDS allows through PATCH — quantity,
 * timing, basis, and marketing-year are permanently immutable once a listing is created
 * (withdraw + recreate instead), so this form never shows them. */
export default function OfferEditForm({ offer, onSaved, onCancel }: {
  offer: Offer;
  onSaved: (next: Offer) => void;
  onCancel: () => void;
}) {
  const [variety, setVariety] = useState(offer.variety ?? "");
  const [priceType, setPriceType] = useState<PriceType | "">(offer.price_type ?? "");
  const [desiredPrice, setDesiredPrice] = useState(offer.desired_price?.toString() ?? "");
  const [proteinPct, setProteinPct] = useState(offer.protein_pct?.toString() ?? "");
  const [moisturePctMax, setMoisturePctMax] = useState(offer.moisture_pct_max?.toString() ?? "");
  const [minOrder, setMinOrder] = useState(offer.min_order?.toString() ?? "");
  const [harvestStart, setHarvestStart] = useState(offer.harvest_start ?? "");
  const [harvestEnd, setHarvestEnd] = useState(offer.harvest_end ?? "");
  const [deliveryWindowStart, setDeliveryWindowStart] = useState(offer.delivery_window_start ?? "");
  const [deliveryWindowEnd, setDeliveryWindowEnd] = useState(offer.delivery_window_end ?? "");
  const [testWeight, setTestWeight] = useState(offer.test_weight?.toString() ?? "");
  const [bcfmPct, setBcfmPct] = useState(offer.bcfm_pct?.toString() ?? "");
  const [seedVariety, setSeedVariety] = useState(offer.seed_variety ?? "");
  const [tanninLevelMax, setTanninLevelMax] = useState(offer.tannin_level_max?.toString() ?? "");
  const [nonTanninSorghum, setNonTanninSorghum] = useState(offer.non_tannin_sorghum);
  const [bnfmPct, setBnfmPct] = useState(offer.bnfm_pct?.toString() ?? "");
  const [sustainabilityAttributes, setSustainabilityAttributes] = useState(offer.sustainability_attributes);
  const [specialtyAttributes, setSpecialtyAttributes] = useState(offer.specialty_attributes);
  const [certifications, setCertifications] = useState(offer.certifications);
  const [locations, setLocations] = useState<OfferLocation[]>(offer.locations);
  const [overrideConservationPractices, setOverrideConservationPractices] = useState(offer.production.conservation_practices);
  const [methodology, setMethodology] = useState(offer.methodology ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Carbon / environmental-data offers have none of the grain fields (variety, quality specs,
  // harvest window, attributes) — only price, minimum, delivery, methodology, standards, practices.
  const outcome = isOutcomeListing(offer);

  const sustainabilityAttrTerms = useTaxonomyTerms("attribute", "sustainability");
  const specialtyAttrTerms = useTaxonomyTerms("attribute", "specialty");
  const practices = useTaxonomyTerms("practice");
  const certificationTerms = useTaxonomyTerms("certification");

  const toggleLocationState = (states: string[]) => {
    setLocations(states.map((s) => locations.find((l) => l.state === s) || { state: s, counties: [] }));
  };
  const setLocationCounties = (state: string, counties: string[]) => {
    setLocations(locations.map((l) => (l.state === state ? { ...l, counties } : l)));
  };

  const save = async () => {
    const rangeErr = dateRangeError(deliveryWindowStart, deliveryWindowEnd, "Delivery Window")
      ?? dateRangeError(harvestStart, harvestEnd, "Harvest Window");
    if (rangeErr) return setError(rangeErr);
    setError(null);
    setSaving(true);
    try {
      const { offer: updated } = await api.updateOffer(offer.id, outcome ? {
        desired_price: desiredPrice, min_order: minOrder, methodology,
        delivery_window_start: deliveryWindowStart || null, delivery_window_end: deliveryWindowEnd || null,
        certifications, override_conservation_practices: overrideConservationPractices,
      } : {
        variety, price_type: priceType || null, desired_price: desiredPrice,
        protein_pct: proteinPct, moisture_pct_max: moisturePctMax, min_order: minOrder,
        harvest_start: harvestStart || null, harvest_end: harvestEnd || null,
        delivery_window_start: deliveryWindowStart || null, delivery_window_end: deliveryWindowEnd || null,
        test_weight: testWeight, bcfm_pct: bcfmPct, seed_variety: seedVariety || null,
        tannin_level_max: tanninLevelMax, non_tannin_sorghum: nonTanninSorghum, bnfm_pct: bnfmPct,
        sustainability_attributes: sustainabilityAttributes,
        specialty_attributes: specialtyAttributes,
        certifications, locations,
        override_conservation_practices: overrideConservationPractices,
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
        Quantity, timing, basis, and marketing year can't be changed here — withdraw and create a new listing for those.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {outcome ? (
          <>
            <DateRangeField className="sm:col-span-2" label="Delivery Window" required={offer.listing_timing === "future"}
              start={deliveryWindowStart} end={deliveryWindowEnd}
              onStartChange={setDeliveryWindowStart} onEndChange={setDeliveryWindowEnd} />
            <div>
              <label className="label">Asking Price ($/{offerPriceUnit(offer)})</label>
              <NumberInput value={desiredPrice} onChange={(v) => setDesiredPrice(v)} />
            </div>
            <div>
              <label className="label">Minimum Purchase ({offer.uom})</label>
              <NumberInput value={minOrder} onChange={(v) => setMinOrder(v)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Methodology / Registry</label>
              <input className="field" maxLength={200} value={methodology} onChange={(e) => setMethodology(e.target.value)} />
            </div>
          </>
        ) : (<>
        <div>
          <label className="label">Variety / Class</label>
          <select className="field" value={variety} disabled={!COMMODITY_VARIETIES[offer.commodity]}
            onChange={(e) => setVariety(e.target.value)}>
            <option value="">{COMMODITY_VARIETIES[offer.commodity] ? "Select variety" : "No varieties for this crop"}</option>
            {(COMMODITY_VARIETIES[offer.commodity] ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <DateRangeField className="sm:col-span-2" label="Delivery Window" required={offer.listing_timing === "future"}
          start={deliveryWindowStart} end={deliveryWindowEnd}
          onStartChange={setDeliveryWindowStart} onEndChange={setDeliveryWindowEnd} />
        <div>
          <label className="label">Price Type</label>
          <select className="field" value={priceType} onChange={(e) => setPriceType(e.target.value as PriceType | "")}>
            <option value="">Select price type</option>
            {PRICE_TYPE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Desired Price ($/{offerPriceUnit(offer)})</label>
          <NumberInput value={desiredPrice} onChange={(v) => setDesiredPrice(v)} />
        </div>
        <div>
          <label className="label">Minimum Delivery Volume</label>
          <NumberInput value={minOrder} onChange={(v) => setMinOrder(v)} />
        </div>
        <div>
          <label className="label">Protein %</label>
          <NumberInput value={proteinPct} onChange={(v) => setProteinPct(v)} />
        </div>
        <div>
          <label className="label">Moisture % Max</label>
          <NumberInput value={moisturePctMax} onChange={(v) => setMoisturePctMax(v)} />
        </div>
        <DateRangeField className="sm:col-span-2" label="Harvest Window"
          start={harvestStart} end={harvestEnd} onStartChange={setHarvestStart} onEndChange={setHarvestEnd} />
        <div>
          <label className="label">Test Weight</label>
          <NumberInput value={testWeight} onChange={(v) => setTestWeight(v)} />
        </div>
        <div>
          <label className="label">BCFM %</label>
          <NumberInput value={bcfmPct} onChange={(v) => setBcfmPct(v)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Seed Variety</label>
          <div className="flex gap-4">
            {(["Non-GM", "GM"] as const).map((v) => (
              <label key={v} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="radio" name="seed_variety_edit" checked={seedVariety === v} onChange={() => setSeedVariety(v)} />
                {v}
              </label>
            ))}
          </div>
        </div>
        {offer.commodity === "Sorghum" && (
          <>
            <div>
              <label className="label">Tannin Level (Max.)</label>
              <NumberInput value={tanninLevelMax} onChange={(v) => setTanninLevelMax(v)} />
            </div>
            <div>
              <label className="label">BNFM %</label>
              <NumberInput value={bnfmPct} onChange={(v) => setBnfmPct(v)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={nonTanninSorghum} onChange={(e) => setNonTanninSorghum(e.target.checked)} />
              Non-Tannin / White Sorghum
            </label>
          </>
        )}
        </>)}
      </div>

      {!outcome && <div>
        <label className="label">State(s)</label>
        <ChipMultiSelect options={US_STATES} selected={locations.map((l) => l.state)} onChange={toggleLocationState} />
        {locations.map((loc) => (
          <CountyPicker key={loc.state} state={loc.state} selected={loc.counties}
            onChange={(counties) => setLocationCounties(loc.state, counties)} />
        ))}
      </div>}

      <div className="space-y-3">
        {!outcome && <>
        <div>
          <label className="label">Sustainability Attributes</label>
          <ChipMultiSelect options={sustainabilityAttrTerms.labels} titles={sustainabilityAttrTerms.titles} selected={sustainabilityAttributes} onChange={setSustainabilityAttributes} />
          <AttributeRequestLink type="attribute" />
        </div>
        <div>
          <label className="label">Specialty Attributes</label>
          <ChipMultiSelect options={specialtyAttrTerms.labels} titles={specialtyAttrTerms.titles} selected={specialtyAttributes} onChange={setSpecialtyAttributes} />
        </div>
        </>}
        <div>
          <label className="label">{outcome ? "Standards / Certifications" : "Certifications"}</label>
          <ChipMultiSelect options={certificationTerms.labels} titles={certificationTerms.titles} selected={certifications} onChange={setCertifications} />
          <AttributeRequestLink type="certification" />
        </div>
        <div>
          <label className="label">{outcome ? "Practices" : "Conservation Practices (for this listing)"}</label>
          <ChipMultiSelect options={practices.labels} titles={practices.titles} selected={overrideConservationPractices} onChange={setOverrideConservationPractices} />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" className="btn-ghost" disabled={saving} onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Changes"}</button>
      </div>
    </div>
  );
}

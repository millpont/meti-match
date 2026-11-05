import { useEffect, useState } from "react";
import { api } from "../api";
import { ChipMultiSelect, Spinner, NumberInput } from "../ui";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import AttributeRequestLink from "../AttributeRequestLink";
import type { BuyerRequirementsDraft } from "../types";
import { GRAIN_COMMODITIES } from "../listings/constants";

const EMPTY: BuyerRequirementsDraft = {
  volumes_min: "", volumes_max: "", commodities: [], attributes: [], practices: [],
  traceability_required: false, certification_required: [], production_data_required: false,
};

export default function RequirementsForm() {
  const [draft, setDraft] = useState<BuyerRequirementsDraft | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sustainabilityAttributes = useTaxonomyTerms("attribute", "sustainability");
  const specialtyAttributes = useTaxonomyTerms("attribute", "specialty");
  const practices = useTaxonomyTerms("practice");
  const certifications = useTaxonomyTerms("certification");

  useEffect(() => {
    api.getBuyerRequirements().then((r) => {
      const req = r.requirements;
      setDraft(req ? {
        volumes_min: req.volumes_min?.toString() ?? "",
        volumes_max: req.volumes_max?.toString() ?? "",
        commodities: req.commodities, attributes: req.attributes, practices: req.practices,
        traceability_required: req.traceability_required,
        certification_required: req.certification_required,
        production_data_required: req.production_data_required,
      } : EMPTY);
    }).catch(() => setDraft(EMPTY));
  }, []);

  if (!draft) return <div className="flex justify-center py-8"><Spinner /></div>;

  const set = <K extends keyof BuyerRequirementsDraft>(k: K, v: BuyerRequirementsDraft[K]) =>
    setDraft((d) => d && { ...d, [k]: v });

  // The two segment pickers below only know their own pool of options, so each one's onChange
  // only gives the next selection within that pool — merge back in whatever's selected from the
  // OTHER segment before writing to the single flat `attributes` array this form stores.
  const setAttributesInSegment = (segmentLabels: string[], nextForSegment: string[]) => {
    const keptFromOtherSegment = draft.attributes.filter((a) => !segmentLabels.includes(a));
    set("attributes", [...keptFromOtherSegment, ...nextForSegment]);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.putBuyerRequirements(draft);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-slate-900">My Requirements</h2>
      <p className="mt-0.5 text-sm text-slate-600">What you're generally looking for — used to surface matching supply.</p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-3 text-sm text-emerald-700">Saved.</p>}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Volumes Min (MT)</label>
          <NumberInput value={draft.volumes_min}
            onChange={(v) => set("volumes_min", v)} />
        </div>
        <div>
          <label className="label">Volumes Max (MT)</label>
          <NumberInput value={draft.volumes_max}
            onChange={(v) => set("volumes_max", v)} />
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label className="label">Commodities</label>
          <ChipMultiSelect options={GRAIN_COMMODITIES} selected={draft.commodities} onChange={(v) => set("commodities", v)} />
        </div>
        <div>
          <label className="label">Required Sustainability Attributes</label>
          <ChipMultiSelect
            options={sustainabilityAttributes.labels} titles={sustainabilityAttributes.titles}
            selected={draft.attributes.filter((a) => sustainabilityAttributes.labels.includes(a))}
            onChange={(v) => setAttributesInSegment(sustainabilityAttributes.labels, v)}
          />
          <AttributeRequestLink type="attribute" />
        </div>
        <div>
          <label className="label">Required Specialty Attributes</label>
          <ChipMultiSelect
            options={specialtyAttributes.labels} titles={specialtyAttributes.titles}
            selected={draft.attributes.filter((a) => specialtyAttributes.labels.includes(a))}
            onChange={(v) => setAttributesInSegment(specialtyAttributes.labels, v)}
          />
        </div>
        <div>
          <label className="label">Preferred Practices</label>
          <ChipMultiSelect options={practices.labels} titles={practices.titles} selected={draft.practices} onChange={(v) => set("practices", v)} />
          <AttributeRequestLink type="practice" />
        </div>
        <div>
          <label className="label">Certification Required</label>
          <ChipMultiSelect options={certifications.labels} titles={certifications.titles} selected={draft.certification_required} onChange={(v) => set("certification_required", v)} />
          <AttributeRequestLink type="certification" />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={draft.traceability_required}
            onChange={(e) => set("traceability_required", e.target.checked)} />
          Traceability required
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={draft.production_data_required}
            onChange={(e) => set("production_data_required", e.target.checked)} />
          Production data required
        </label>
      </div>

      <div className="mt-5 flex justify-end">
        <button type="button" className="btn-primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save Requirements"}
        </button>
      </div>
    </div>
  );
}

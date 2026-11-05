import { useEffect, useState } from "react";
import { api } from "../api";
import { ChipMultiSelect, NONE_OPTION, NumberInput, Spinner } from "../ui";
import { formatNumber, rotationLabel } from "../format";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import { ChevronIcon } from "../icons";
import { marketingYears } from "./constants";
import ProductionDocumentsPanel from "./ProductionDocumentsPanel";
import type { EnrolledGrowerOption, IrrigationType, ManureType, ProductionDataDraft, ProductionDataEntry, YieldUnit } from "../types";

const ANY_YEAR = "any";
const MARKETING_YEARS = marketingYears();

// Nitrification inhibitors are stored as a 0–1 fraction (the USDA FD-CIC input) but entered and
// shown as a percent — growers think "40% of my N was treated", not "0.4".
const fractionToPct = (f: number | null | undefined) => (f == null ? "" : String(Math.round(f * 100 * 1000) / 1000));
const pctToFraction = (pct: string) => (pct === "" ? "" : String(Number(pct) / 100));

function draftFromEntry(e: ProductionDataEntry, marketingYear: string): ProductionDataDraft {
  return {
    marketing_year: marketingYear,
    actual_yield_per_acre: e.actual_yield_per_acre?.toString() ?? "",
    yield_unit: e.yield_unit ?? "",
    irrigation_type: e.irrigation_type ?? "",
    crop_rotation_years: e.crop_rotation_years?.toString() ?? "",
    crop_rotation_crops: e.crop_rotation_crops?.toString() ?? "",
    soil_test_on_file: e.soil_test_on_file,
    third_party_verified: e.third_party_verified,
    input_usage_notes: e.input_usage_notes ?? "",
    conservation_practices: e.conservation_practices,
    sustainability_attributes: e.sustainability_attributes,
    specialty_attributes: e.specialty_attributes,
    manure_type: e.manure_type ?? "",
    show_advanced_in_listing: e.show_advanced_in_listing,
    nitrogen_lbs_per_acre: e.nitrogen_lbs_per_acre?.toString() ?? "",
    // Held as a PERCENT in the draft (see fractionToPct); converted back on save.
    nitrification_inhibitor_fraction: fractionToPct(e.nitrification_inhibitor_fraction),
    synthetic_phosphorus_lbs_per_acre: e.synthetic_phosphorus_lbs_per_acre?.toString() ?? "",
    synthetic_potassium_lbs_per_acre: e.synthetic_potassium_lbs_per_acre?.toString() ?? "",
    lime_dolomite_lbs_per_acre: e.lime_dolomite_lbs_per_acre?.toString() ?? "",
    herbicide_lbs_per_acre: e.herbicide_lbs_per_acre?.toString() ?? "",
    insecticide_lbs_per_acre: e.insecticide_lbs_per_acre?.toString() ?? "",
    fungicide_lbs_per_acre: e.fungicide_lbs_per_acre?.toString() ?? "",
    manure_lbs_per_acre: e.manure_lbs_per_acre?.toString() ?? "",
    tdisc_score: e.tdisc_score?.toString() ?? "",
    diesel_gal_per_acre: e.diesel_gal_per_acre?.toString() ?? "",
    gasoline_gal_per_acre: e.gasoline_gal_per_acre?.toString() ?? "",
    natural_gas_total_therms: e.natural_gas_total_therms?.toString() ?? "",
    lpg_total_gallons: e.lpg_total_gallons?.toString() ?? "",
    electricity_kwh_per_acre: e.electricity_kwh_per_acre?.toString() ?? "",
  };
}

function ProgressBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="text-xs text-slate-500">{pct === 100 ? "Complete" : pct === 0 ? "Not started" : "In Progress"}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-brand-bg">
        <div className="h-full rounded-full bg-brand-green transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** A copy of an enrolled grower's commodity defaults, staged into the operator's own form for
 * them to review and save — never written without the operator hitting Save. */
type CopiedDefaults = { entry: ProductionDataEntry; fromName: string; nonce: number };

export default function ProductionData({ forOperator }: { forOperator?: boolean }) {
  const [marketingYear, setMarketingYear] = useState(ANY_YEAR);
  const [entries, setEntries] = useState<ProductionDataEntry[] | null>(null);
  const [openCommodity, setOpenCommodity] = useState<string | null>(null);
  const [copied, setCopied] = useState<Record<string, CopiedDefaults>>({});

  const copyFromGrower = (entry: ProductionDataEntry, fromName: string) => {
    setCopied((c) => ({ ...c, [entry.commodity]: { entry, fromName, nonce: Date.now() } }));
    setOpenCommodity(entry.commodity);
  };

  useEffect(() => {
    api.getProductionData(marketingYear === ANY_YEAR ? undefined : marketingYear).then((r) => {
      setEntries(r.commodities);
    }).catch(() => setEntries([]));
  }, [marketingYear]);

  // Every year any commodity has its own saved row for, merged with the standard 4-year range —
  // so a year typed in previously (even one outside the current default window) stays selectable.
  const yearOptions = Array.from(new Set([
    ...MARKETING_YEARS,
    ...(entries ?? []).flatMap((e) => e.saved_years),
  ])).sort();

  if (!entries) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="card space-y-4 p-5">
        <h2 className="text-base font-semibold text-slate-900">Production Data Progress</h2>
        {entries.map((e) => (
          <ProgressBar key={e.commodity} label={e.commodity} pct={e.advanced_completion_pct} />
        ))}
      </div>

      <div className="card p-4">
        <label className="label">Marketing Year</label>
        <select className="field" value={marketingYear} onChange={(e) => setMarketingYear(e.target.value)}>
          <option value={ANY_YEAR}>Any year (default)</option>
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Save a separate set of defaults for a specific marketing year, or leave "Any year" as the
          fallback used whenever no year-specific defaults exist for that crop.
        </p>
      </div>

      <div className="space-y-4">
        {entries.map((e) => (
          <CommodityCard
            key={e.commodity}
            entry={e}
            marketingYear={marketingYear}
            copied={copied[e.commodity]}
            open={openCommodity === e.commodity}
            onToggle={() => setOpenCommodity(openCommodity === e.commodity ? null : e.commodity)}
            onSaved={(next) => setEntries((es) => es && es.map((x) => (x.commodity === e.commodity ? next : x)))}
          />
        ))}
      </div>

      {forOperator && <EnrolledGrowersProductionData marketingYear={marketingYear} onCopy={copyFromGrower} />}
    </div>
  );
}

/** Operator-only: read-only look at an actively-enrolled grower's saved Production Data, with a
 * per-crop "copy into my defaults" shortcut. */
function EnrolledGrowersProductionData({
  marketingYear, onCopy,
}: {
  marketingYear: string;
  onCopy: (entry: ProductionDataEntry, fromName: string) => void;
}) {
  const [growers, setGrowers] = useState<EnrolledGrowerOption[] | null>(null);
  const [growerId, setGrowerId] = useState("");
  const [data, setData] = useState<{ grower_name: string | null; commodities: ProductionDataEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedNote, setCopiedNote] = useState<string | null>(null);

  useEffect(() => {
    api.activeGrowersForOffers().then((r) => setGrowers(r.growers)).catch(() => setGrowers([]));
  }, []);

  useEffect(() => {
    if (!growerId) return setData(null);
    setError(null);
    api.enrolledGrowerProductionData(growerId, marketingYear === ANY_YEAR ? undefined : marketingYear)
      .then(setData)
      .catch((e) => { setData(null); setError(e instanceof Error ? e.message : "Couldn't load"); });
  }, [growerId, marketingYear]);

  const tags = (c: ProductionDataEntry) =>
    [...c.conservation_practices, ...c.sustainability_attributes, ...c.specialty_attributes].filter((v) => v !== NONE_OPTION);

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-slate-900">Enrolled Growers' Production Data</h2>
      <p className="mt-1 text-sm text-slate-600">
        Review the production data your enrolled growers have saved, and copy a crop's settings into
        your own defaults above. Read-only — each grower keeps sole control of their own data.
      </p>
      {growers && growers.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No actively-enrolled growers yet — invite or register growers from the Enrolled Growers tab.</p>
      ) : (
        <select className="field mt-3 max-w-sm" value={growerId} onChange={(e) => { setGrowerId(e.target.value); setCopiedNote(null); }}>
          <option value="">Select an enrolled grower</option>
          {(growers ?? []).map((g) => <option key={g.grower_account_id} value={g.grower_account_id}>{g.grower_name || "Unnamed grower"}</option>)}
        </select>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {copiedNote && <p className="mt-2 text-sm text-emerald-700">{copiedNote}</p>}
      {data && (
        <div className="mt-4 space-y-3">
          {data.commodities.map((c) => {
            const empty = c.advanced_completion_pct === 0 && tags(c).length === 0;
            return (
              <div key={c.commodity} className="rounded-lg border border-brand-edge p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">{c.commodity} <span className="text-xs font-normal text-slate-500">· {c.advanced_completion_pct}% complete</span></span>
                  {!empty && (
                    <button type="button" className="btn-ghost !py-1 !px-2 text-xs" onClick={() => {
                      onCopy(c, data.grower_name || "this grower");
                      setCopiedNote(`Copied ${data.grower_name || "the grower"}'s ${c.commodity} settings into your ${c.commodity} form above — review and save to keep them.`);
                    }}>
                      Copy to my {c.commodity} defaults
                    </button>
                  )}
                </div>
                {empty ? (
                  <p className="mt-1 text-xs text-slate-400">Nothing saved yet.</p>
                ) : (
                  <div className="mt-1 text-slate-600">
                    {[
                      c.actual_yield_per_acre != null && `Yield ${formatNumber(c.actual_yield_per_acre)} ${c.yield_unit ?? ""}`,
                      c.irrigation_type,
                      rotationLabel(c.crop_rotation_crops, c.crop_rotation_years),
                      c.soil_test_on_file && "soil test on file",
                      c.third_party_verified && "third-party verified",
                    ].filter(Boolean).join(" · ") || "—"}
                    {tags(c).length > 0 && <div className="mt-1 text-xs text-slate-500">{tags(c).join(", ")}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CommodityCard({
  entry, marketingYear, copied, open, onToggle, onSaved,
}: {
  entry: ProductionDataEntry;
  marketingYear: string;
  copied?: CopiedDefaults;
  open: boolean;
  onToggle: () => void;
  onSaved: (next: ProductionDataEntry) => void;
}) {
  const [draft, setDraft] = useState<ProductionDataDraft>(draftFromEntry(entry, marketingYear));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const practices = useTaxonomyTerms("practice");
  const sustainabilityAttributes = useTaxonomyTerms("attribute", "sustainability");
  const specialtyAttributes = useTaxonomyTerms("attribute", "specialty");

  // Re-sync when the page-level marketing year changes (a fresh entry arrives for this
  // commodity) or when this specific entry gets saved elsewhere.
  useEffect(() => { setDraft(draftFromEntry(entry, marketingYear)); }, [entry, marketingYear]);

  // Stage a copy of an enrolled grower's settings into this form (operator only). Documents
  // aren't copied — they're the grower's own files — and nothing saves until Save is clicked.
  useEffect(() => {
    if (!copied) return;
    setDraft((d) => ({ ...draftFromEntry(copied.entry, marketingYear), show_advanced_in_listing: d.show_advanced_in_listing }));
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copied?.nonce]);

  const set = <K extends keyof ProductionDataDraft>(k: K, v: ProductionDataDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const r = await api.putProductionData(entry.commodity, {
        ...draft, nitrification_inhibitor_fraction: pctToFraction(draft.nitrification_inhibitor_fraction),
      });
      const savedYears = draft.marketing_year !== ANY_YEAR && !entry.saved_years.includes(draft.marketing_year)
        ? [...entry.saved_years, draft.marketing_year].sort()
        : entry.saved_years;
      onSaved({ ...entry, ...r, commodity: entry.commodity, saved_years: savedYears });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-5">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={onToggle}>
        <div>
          <div className="text-base font-semibold text-slate-900">{entry.commodity}</div>
          <div className="text-xs text-slate-500">{entry.advanced_completion_pct}% complete</div>
        </div>
        <span className="text-sm text-brand-green">{open ? "Hide" : "Edit"}</span>
      </button>

      {open && (
        <div className="mt-4 border-t border-brand-edge pt-4">
          <p className="mb-1 text-sm text-slate-600">
            {marketingYear === ANY_YEAR
              ? `Used as the fallback default for every ${entry.commodity} offer you post, for any marketing year without its own saved defaults.`
              : `Defaults specifically for marketing year ${marketingYear}.`}
          </p>
          {entry.is_fallback_to_any_year && (
            <p className="mb-3 text-xs text-amber-700">
              No defaults saved yet for {marketingYear} — showing the "Any year" fallback. Saving here creates a
              separate set of defaults just for {marketingYear}.
            </p>
          )}
          <p className="mb-3 text-xs text-slate-500">
            Override it on a specific listing if that lot's practices differ.
          </p>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          {saved && <p className="mb-3 text-sm text-emerald-700">Saved.</p>}
          {copied && !saved && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Showing settings copied from {copied.fromName} — review, then click Save to make them your {entry.commodity} defaults.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Actual Yield</label>
              <div className="flex gap-2">
                <NumberInput value={draft.actual_yield_per_acre}
                  onChange={(v) => set("actual_yield_per_acre", v)} />
                <select className="field" value={draft.yield_unit}
                  onChange={(e) => set("yield_unit", e.target.value as YieldUnit | "")}>
                  <option value="">Unit</option>
                  <option value="bu/acre">bu/acre</option>
                  <option value="MT/acre">MT/acre</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Irrigation Type</label>
              <select className="field" value={draft.irrigation_type}
                onChange={(e) => set("irrigation_type", e.target.value as IrrigationType | "")}>
                <option value="">Select type</option>
                <option value="dryland">Dryland</option>
                <option value="rainfed">Rainfed</option>
                <option value="irrigated">Irrigated</option>
              </select>
            </div>
            <div>
              <label className="label">Crop Rotation</label>
              <div className="flex items-center gap-2">
                <NumberInput aria-label="Number of crops" placeholder="Crops" value={draft.crop_rotation_crops}
                  onChange={(v) => set("crop_rotation_crops", v)} />
                <span className="shrink-0 text-sm text-slate-500">crops over</span>
                <NumberInput aria-label="Number of years" placeholder="Years" value={draft.crop_rotation_years}
                  onChange={(v) => set("crop_rotation_years", v)} />
                <span className="shrink-0 text-sm text-slate-500">years</span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="label">Input Usage Notes</label>
            <textarea className="field" rows={3} value={draft.input_usage_notes}
              onChange={(e) => set("input_usage_notes", e.target.value)} />
          </div>

          <div className="mt-4">
            <label className="label">Conservation Practices</label>
            <ChipMultiSelect noneOption options={practices.labels} titles={practices.titles} selected={draft.conservation_practices}
              onChange={(v) => set("conservation_practices", v)} />
          </div>

          <div className="mt-4">
            <label className="label">Sustainability Attributes</label>
            <ChipMultiSelect noneOption options={sustainabilityAttributes.labels} titles={sustainabilityAttributes.titles} selected={draft.sustainability_attributes}
              onChange={(v) => set("sustainability_attributes", v)} />
            <p className="mt-1 text-xs text-slate-500">
              Pre-fills new {entry.commodity} offers — still freely editable per listing.
            </p>
          </div>

          <div className="mt-4">
            <label className="label">Specialty Attributes</label>
            <ChipMultiSelect noneOption options={specialtyAttributes.labels} titles={specialtyAttributes.titles} selected={draft.specialty_attributes}
              onChange={(v) => set("specialty_attributes", v)} />
            <p className="mt-1 text-xs text-slate-500">
              Pre-fills new {entry.commodity} offers — still freely editable per listing.
            </p>
          </div>

          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={draft.soil_test_on_file}
                onChange={(e) => set("soil_test_on_file", e.target.checked)} />
              Soil test on file
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={draft.third_party_verified}
                onChange={(e) => set("third_party_verified", e.target.checked)} />
              Third-party verified
            </label>
          </div>

          <div className="mt-4 border-t border-brand-edge pt-4">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-brand-edge bg-brand-bg/40 px-3 py-2.5 text-left transition-colors hover:border-brand-green"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">Advanced Production Criteria</div>
                <div className="text-xs text-slate-500">USDA FD-CIC inputs — click to {showAdvanced ? "collapse" : "expand"}</div>
              </div>
              <ChevronIcon className={`h-4 w-4 shrink-0 text-brand-green transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            </button>
            {showAdvanced && (
              <div className="mt-3">
                <label className="flex items-start gap-2 rounded-lg border border-brand-edge bg-amber-50 p-3 text-sm text-slate-700">
                  <input type="checkbox" className="mt-0.5" checked={draft.show_advanced_in_listing}
                    onChange={(e) => set("show_advanced_in_listing", e.target.checked)} />
                  <span>
                    <span className="font-medium">Show these advanced criteria on my {entry.commodity} listings</span>
                    <br />
                    <span className="text-xs text-slate-500">
                      Off by default — buyers won't see any of the fields below until you check this,
                      even if you fill them out.
                    </span>
                  </span>
                </label>
              </div>
            )}
            {showAdvanced && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Nitrogen (lbs/acre)</label>
                  <NumberInput value={draft.nitrogen_lbs_per_acre}
                    onChange={(v) => set("nitrogen_lbs_per_acre", v)} />
                </div>
                <div>
                  <label className="label">Nitrification Inhibitors (% of nitrogen treated)</label>
                  <NumberInput value={draft.nitrification_inhibitor_fraction}
                    onChange={(v) => set("nitrification_inhibitor_fraction", v)} />
                </div>
                <div>
                  <label className="label">Synthetic Phosphorus (lbs/acre)</label>
                  <NumberInput value={draft.synthetic_phosphorus_lbs_per_acre}
                    onChange={(v) => set("synthetic_phosphorus_lbs_per_acre", v)} />
                </div>
                <div>
                  <label className="label">Synthetic Potassium (lbs/acre)</label>
                  <NumberInput value={draft.synthetic_potassium_lbs_per_acre}
                    onChange={(v) => set("synthetic_potassium_lbs_per_acre", v)} />
                </div>
                <div>
                  <label className="label">Lime/Dolomite (lbs/acre)</label>
                  <NumberInput value={draft.lime_dolomite_lbs_per_acre}
                    onChange={(v) => set("lime_dolomite_lbs_per_acre", v)} />
                </div>
                <div>
                  <label className="label">Herbicide (lbs/acre)</label>
                  <NumberInput value={draft.herbicide_lbs_per_acre}
                    onChange={(v) => set("herbicide_lbs_per_acre", v)} />
                </div>
                <div>
                  <label className="label">Insecticide (lbs/acre)</label>
                  <NumberInput value={draft.insecticide_lbs_per_acre}
                    onChange={(v) => set("insecticide_lbs_per_acre", v)} />
                </div>
                <div>
                  <label className="label">Fungicide (lbs/acre)</label>
                  <NumberInput value={draft.fungicide_lbs_per_acre}
                    onChange={(v) => set("fungicide_lbs_per_acre", v)} />
                </div>
                <div>
                  <label className="label">Manure (lbs/acre)</label>
                  <NumberInput value={draft.manure_lbs_per_acre}
                    onChange={(v) => set("manure_lbs_per_acre", v)} />
                </div>
                <div>
                  <label className="label">Manure Type</label>
                  <select className="field" value={draft.manure_type}
                    onChange={(e) => set("manure_type", e.target.value as ManureType | "")}>
                    <option value="">Select type</option>
                    <option value="dairy">Dairy</option>
                    <option value="beef">Beef</option>
                    <option value="swine">Swine</option>
                    <option value="poultry">Poultry</option>
                  </select>
                </div>
                <div>
                  <label className="label">TDISC Score</label>
                  <NumberInput value={draft.tdisc_score}
                    onChange={(v) => set("tdisc_score", v)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Energy Consumption</label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-slate-500">Diesel (gal/acre)</label>
                      <NumberInput value={draft.diesel_gal_per_acre}
                        onChange={(v) => set("diesel_gal_per_acre", v)} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Gasoline (gal/acre)</label>
                      <NumberInput value={draft.gasoline_gal_per_acre}
                        onChange={(v) => set("gasoline_gal_per_acre", v)} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Natural Gas (total therms)</label>
                      <NumberInput value={draft.natural_gas_total_therms}
                        onChange={(v) => set("natural_gas_total_therms", v)} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">LPG (total gallons)</label>
                      <NumberInput value={draft.lpg_total_gallons}
                        onChange={(v) => set("lpg_total_gallons", v)} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Electricity (kWh/acre)</label>
                      <NumberInput value={draft.electricity_kwh_per_acre}
                        onChange={(v) => set("electricity_kwh_per_acre", v)} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-brand-edge pt-4">
            <ProductionDocumentsPanel entry={entry} onSoilTestChanged={onSaved} onVerificationChanged={onSaved} />
          </div>

          <div className="mt-5 flex justify-end">
            <button type="button" className="btn-primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : `Save ${entry.commodity} Defaults`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

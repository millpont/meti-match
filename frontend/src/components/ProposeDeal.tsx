import { useMemo, useState } from "react";
import { api } from "../api";
import type { AccountType, DealDraft, OutcomeField, OutcomePricing, SuggestedMatch } from "../types";
import { COMMODITY_GROUPS, OUTCOMES, PRACTICES, PRICING_INFLUENCES, REGIONS, US_STATES, YEARS } from "../constants";
import { ADDITIONALITY, CARBON_POOLS, CREDIT_CHARACTER, EMISSION_SOURCES, STRATA } from "../taxonomy";
import { Badge, ChipMultiSelect, GroupedChipSelect, Spinner } from "../ui";

const EMPTY_VALUES: Record<OutcomeField, string> = {
  ci_commodity_t: "", reductions_t: "", removals_t: "", water_quantity: "",
  water_quality_n: "", water_quality_p: "", water_quality_tss: "", acres: "",
};

// Quantities and prices can't be negative — strip any minus signs (covers typing AND paste,
// which `min={0}` on its own does not).
const noNegative = (v: string) => v.replace(/-/g, "");

export default function ProposeDeal({ onProposed }: { onProposed: () => void }) {
  const [type, setType] = useState<AccountType>("buyer");
  const [states, setStates] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [commodities, setCommodities] = useState<string[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [values, setValues] = useState<Record<OutcomeField, string>>(EMPTY_VALUES);
  const [pricing, setPricing] = useState<OutcomePricing>({});
  const [practices, setPractices] = useState<string[]>([]);
  const [influences, setInfluences] = useState<string[]>([]);
  // Activity / methodology taxonomy
  const [carbonPools, setCarbonPools] = useState<string[]>([]);
  const [emissionSources, setEmissionSources] = useState<string[]>([]);
  const [creditCharacter, setCreditCharacter] = useState<string[]>([]);
  const [additionality, setAdditionality] = useState<string | null>(null);
  const [stratum, setStratum] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SuggestedMatch[] | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const activeOutcomes = useMemo(
    () => OUTCOMES.filter((o) => values[o.field].trim() !== ""),
    [values],
  );
  const allCommodities = COMMODITY_GROUPS.flatMap((g) => g.items);

  const draft: DealDraft = {
    account_type: type,
    country: "USA",
    state: states,
    region: states.length === 1 ? regions : [],
    commodity: commodities,
    year: years,
    outcome_pricing: pricing,
    practices: practices.length ? { selected: practices, other: null } : null,
    additional_data: influences,
    carbon_pools: carbonPools,
    emission_sources: emissionSources,
    credit_character: creditCharacter,
    additionality,
    stratum,
    ...(Object.fromEntries(
      OUTCOMES.map((o) => [o.field, values[o.field].trim() || null]),
    ) as Record<OutcomeField, string | null>),
  };

  function setValue(field: OutcomeField, v: string) {
    setValues((prev) => ({ ...prev, [field]: noNegative(v) }));
    setPreview(null);
  }
  function setPrice(field: OutcomeField, key: "floor" | "ceiling", v: string) {
    const clean = noNegative(v);
    setPricing((prev) => ({
      ...prev,
      [field]: { ...prev[field], [key]: clean === "" ? null : Number(clean) },
    }));
  }

  async function submit(confirmAnyway: boolean) {
    setError(null);
    setBusy(true);
    try {
      if (!confirmAnyway) {
        const { matches } = await api.previewMatches(draft);
        if (matches.length) {
          setPreview(matches);
          setBusy(false);
          return;
        }
      }
      const res = await api.createDeal(draft);
      setDone(
        res.is_approved
          ? "Deal published to the board."
          : "Deal submitted — it will appear on the board once an admin approves it.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-2xl">
          ✓
        </div>
        <p className="text-lg font-semibold text-white">{done}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button className="btn-primary" onClick={onProposed}>View boards</button>
          <button className="btn-ghost" onClick={() => window.location.reload()}>Propose another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SegmentedType value={type} onChange={(t) => { setType(t); setPreview(null); }} />

      <section className="card space-y-5 p-6">
        <div>
          <span className="label">State(s)</span>
          <ChipMultiSelect options={US_STATES} selected={states} onChange={(s) => { setStates(s); setPreview(null); }} />
        </div>
        {states.length === 1 && (
          <div>
            <span className="label">Region(s) within {states[0]}</span>
            <ChipMultiSelect options={REGIONS} selected={regions} onChange={setRegions} selectAll />
          </div>
        )}
        <div>
          <span className="label">Commodity(ies)</span>
          <ChipMultiSelect options={allCommodities} selected={commodities} onChange={(c) => { setCommodities(c); setPreview(null); }} />
        </div>
        <div>
          <span className="label">Year(s)</span>
          <ChipMultiSelect options={YEARS} selected={years} onChange={(y) => { setYears(y); setPreview(null); }} />
        </div>
      </section>

      <section className="card p-6">
        <h3 className="mb-1 text-sm font-semibold text-white">Outcomes</h3>
        <p className="mb-4 text-xs text-slate-500">
          Enter a quantity for each outcome you {type === "buyer" ? "want to buy" : "can supply"}.
          {type === "buyer" && " Buyers must set a price range per outcome."}
        </p>
        <div className="space-y-3">
          {OUTCOMES.map((o) => {
            const active = values[o.field].trim() !== "";
            return (
              <div key={o.field} className={`rounded-lg border p-3 ${active ? "border-grain-blue/40 bg-grain-blue/5" : "border-brand-edge"}`}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{o.label}</span>
                      <Badge tone={o.asset === "Carbon" ? "green" : o.asset === "Water" ? "blue" : "amber"}>{o.asset}</Badge>
                    </div>
                    <input
                      className="field mt-2"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      placeholder={`Quantity (${o.unit})`}
                      value={values[o.field]}
                      onChange={(e) => setValue(o.field, e.target.value)}
                    />
                  </div>
                  {active && (
                    <div className="flex gap-2">
                      <div>
                        <span className="label">$ Floor</span>
                        <input className="field w-28" type="number" min={0} placeholder="0.00"
                          value={pricing[o.field]?.floor ?? ""}
                          onChange={(e) => setPrice(o.field, "floor", e.target.value)} />
                      </div>
                      <div>
                        <span className="label">$ Ceiling</span>
                        <input className="field w-28" type="number" min={0} placeholder="0.00"
                          value={pricing[o.field]?.ceiling ?? ""}
                          onChange={(e) => setPrice(o.field, "ceiling", e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {activeOutcomes.length > 0 && (
        <section className="card space-y-5 p-6">
          <div>
            <span className="label">Practice requirements (optional)</span>
            <ChipMultiSelect options={PRACTICES} selected={practices} onChange={setPractices} />
          </div>
          <div>
            <span className="label">Things that influence pricing (optional)</span>
            <ChipMultiSelect options={PRICING_INFLUENCES} selected={influences} onChange={setInfluences} />
          </div>
        </section>
      )}

      <section className="card space-y-5 p-6">
          <div>
            <h3 className="text-sm font-semibold text-white">Activity &amp; methodology</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              What the activity actually accounts for (e.g. above- or below-ground carbon).
              Counterparties are only matched when these are methodologically compatible.
            </p>
          </div>
          <div>
            <span className="label">Carbon pools</span>
            <GroupedChipSelect groups={CARBON_POOLS} selected={carbonPools} onChange={(v) => { setCarbonPools(v); setPreview(null); }} />
          </div>
          <div>
            <span className="label">Emission sources</span>
            <GroupedChipSelect groups={EMISSION_SOURCES} selected={emissionSources} onChange={(v) => { setEmissionSources(v); setPreview(null); }} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <span className="label">Credit character</span>
              <GroupedChipSelect
                groups={[{ group: "", items: CREDIT_CHARACTER }]}
                selected={creditCharacter}
                onChange={setCreditCharacter}
              />
            </div>
            <div>
              <span className="label">Stratum (biome)</span>
              <select className="field" value={stratum ?? ""} onChange={(e) => { setStratum(e.target.value || null); setPreview(null); }}>
                <option value="">Any</option>
                {STRATA.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <span className="label">Additionality</span>
              <select className="field" value={additionality ?? ""} onChange={(e) => setAdditionality(e.target.value || null)}>
                <option value="">Unspecified</option>
                {ADDITIONALITY.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
          </div>
      </section>

      {preview && (
        <section className="card border-amber-500/40 p-6">
          <h3 className="text-sm font-semibold text-amber-300">
            {preview.length} potential {preview.length === 1 ? "match" : "matches"} already on the board
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Counterparties that fit your criteria. You can still submit — you'll be able to express interest from the boards.
          </p>
          <div className="mt-3 space-y-2">
            {preview.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-lg border border-brand-edge px-3 py-2 text-sm">
                <Badge tone={m.board === "offer" ? "green" : "blue"}>{m.board === "offer" ? "Offer" : "Bid"}</Badge>
                <span className="text-slate-300">{(m.commodities || []).join(", ") || "—"}</span>
                <span className="text-slate-500">· {(m.states || []).join(", ")}</span>
                <span className="text-slate-500">· {(m.years || []).join(", ")}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      <div className="flex items-center justify-end gap-3">
        {preview && <span className="text-xs text-slate-500">Reviewed the matches?</span>}
        <button className="btn-primary px-6" disabled={busy} onClick={() => submit(preview !== null)}>
          {busy ? <Spinner /> : preview ? "Submit anyway" : "Submit deal"}
        </button>
      </div>
    </div>
  );
}

function SegmentedType({ value, onChange }: { value: AccountType; onChange: (t: AccountType) => void }) {
  return (
    <div className="card grid grid-cols-2 gap-2 p-2">
      {(["buyer", "seller"] as const).map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`rounded-lg px-4 py-4 text-left transition-colors ${
            value === t ? "bg-grain-blue/15 ring-1 ring-grain-blue" : "hover:bg-brand-edge"
          }`}
        >
          <div className="text-sm font-semibold text-white">{t === "buyer" ? "Buyer" : "Seller"}</div>
          <div className="text-xs text-slate-400">
            {t === "buyer" ? "I want to buy / demand outcomes" : "I want to sell / supply outcomes"}
          </div>
        </button>
      ))}
    </div>
  );
}

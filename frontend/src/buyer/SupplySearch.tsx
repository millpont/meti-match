import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { EmptyState, MultiSelectDropdown, Spinner, NumberInput } from "../ui";
import { US_STATES } from "../constants";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import type { Offer, OfferFilters, Organization } from "../types";
import { GRAIN_COMMODITIES } from "../listings/constants";
import SupplyOfferCard from "../listings/SupplyOfferCard";
import RespondAmountModal from "../listings/RespondAmountModal";
import CreateRfqForm from "./CreateRfqForm";
import ListingComposer from "../listings/ListingComposer";
import { outcomesFor } from "../listings/environmental";

/** Supply tabs: grain by volume, grain by acres, then carbon and environmental-data offers. */
type SupplyTab = "grain" | "acres" | "carbon" | "environmental";
const SUPPLY_TABS: { id: SupplyTab; label: string }[] = [
  { id: "grain", label: "Grain" },
  { id: "acres", label: "Acres" },
  { id: "carbon", label: "Carbon" },
  { id: "environmental", label: "Environmental Data" },
];

function tabFilters(tab: SupplyTab): Partial<Pick<OfferFilters, "quantityBasis" | "assetClasses">> {
  return tab === "carbon" || tab === "environmental"
    ? { quantityBasis: "outcome", assetClasses: [tab] }
    : { quantityBasis: tab };
}

export default function SupplySearch() {
  const [basis, setBasis] = useState<SupplyTab>("grain");
  const [commodities, setCommodities] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [selectedCertifications, setSelectedCertifications] = useState<string[]>([]);
  const [selectedSustainabilityAttributes, setSelectedSustainabilityAttributes] = useState<string[]>([]);
  const [selectedSpecialtyAttributes, setSelectedSpecialtyAttributes] = useState<string[]>([]);
  const [selectedPractices, setSelectedPractices] = useState<string[]>([]);
  const [selectedOrganizations, setSelectedOrganizations] = useState<string[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [quantityMin, setQuantityMin] = useState("");
  const [quantityMax, setQuantityMax] = useState("");
  const certifications = useTaxonomyTerms("certification");
  const sustainabilityAttributes = useTaxonomyTerms("attribute", "sustainability");
  const specialtyAttributes = useTaxonomyTerms("attribute", "specialty");
  const practices = useTaxonomyTerms("practice");
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [respondedTo, setRespondedTo] = useState<Set<string>>(new Set());
  const [respondingOffer, setRespondingOffer] = useState<Offer | null>(null);
  const [showRfq, setShowRfq] = useState(false);
  // Guards against an earlier, slower request (e.g. the initial Grain fetch) resolving AFTER a
  // later one (e.g. a quick click over to Acres) and overwriting it with stale results — without
  // this, whichever request happens to finish last wins, regardless of which tab is selected.
  const latestRequestId = useRef(0);

  const search = (overrideBasis: SupplyTab = basis, overrides: { commodities?: string[]; states?: string[]; certifications?: string[]; attributes?: string[]; practices?: string[]; organizations?: string[]; quantityMin?: string; quantityMax?: string } = {}) => {
    const requestId = ++latestRequestId.current;
    api.browseOffers({
      commodities: overrides.commodities ?? commodities, states: overrides.states ?? states,
      certifications: overrides.certifications ?? selectedCertifications,
      attributes: overrides.attributes ?? [...selectedSustainabilityAttributes, ...selectedSpecialtyAttributes],
      practices: overrides.practices ?? selectedPractices,
      organizations: overrides.organizations ?? selectedOrganizations,
      quantityMin: overrides.quantityMin ?? quantityMin, quantityMax: overrides.quantityMax ?? quantityMax,
      ...tabFilters(overrideBasis),
    }).then((r) => { if (requestId === latestRequestId.current) setOffers(r.offers); })
      .catch(() => { if (requestId === latestRequestId.current) setOffers([]); });
  };

  const selectBasis = (next: SupplyTab) => {
    setBasis(next);
    // Crop names and outcome names don't overlap, so a commodity pick never carries across.
    setCommodities([]);
    search(next, { commodities: [] });
  };
  const commodityOptions = basis === "carbon" || basis === "environmental"
    ? outcomesFor(basis).map((o) => o.label)
    : GRAIN_COMMODITIES;

  const hasFilters =
    commodities.length > 0 || states.length > 0 || selectedCertifications.length > 0 ||
    selectedSustainabilityAttributes.length > 0 || selectedSpecialtyAttributes.length > 0 ||
    selectedPractices.length > 0 || selectedOrganizations.length > 0 || !!quantityMin || !!quantityMax;

  const clearFilters = () => {
    setCommodities([]);
    setStates([]);
    setSelectedCertifications([]);
    setSelectedSustainabilityAttributes([]);
    setSelectedSpecialtyAttributes([]);
    setSelectedPractices([]);
    setSelectedOrganizations([]);
    setQuantityMin("");
    setQuantityMax("");
    search(basis, { commodities: [], states: [], certifications: [], attributes: [], practices: [], organizations: [], quantityMin: "", quantityMax: "" });
  };

  useEffect(() => {
    search();
    api.myResponses()
      .then((r) => setRespondedTo(new Set(r.made_by_me.filter((x) => x.listing_type === "offer").map((x) => x.listing_id))))
      .catch(() => {});
    api.organizations().then((r) => setOrganizations(r.organizations)).catch(() => setOrganizations([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const organizationIds = organizations.map((o) => o.account_id);
  const organizationNames: Record<string, string> = {};
  for (const o of organizations) organizationNames[o.account_id] = o.name || "Unnamed organization";

  const confirmRespond = async (amount: string) => {
    if (!respondingOffer) return;
    await api.respondToOffer(respondingOffer.id, { proposedVolume: amount });
    setRespondedTo((s) => new Set(s).add(respondingOffer.id));
    setRespondingOffer(null);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Available Supply</h1>
        <button className="btn-primary" onClick={() => setShowRfq((s) => !s)}>
          {showRfq ? "Close" : "+ Create RFQ"}
        </button>
      </div>

      {showRfq && (
        <div className="mb-6">
          <ListingComposer side="bid" grainForm={<CreateRfqForm onCreated={() => setShowRfq(false)} />} onCreated={() => {}} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {SUPPLY_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectBasis(t.id)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              basis === t.id ? "border-brand-green bg-brand-greenLight text-brand-green" : "border-brand-edge text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card mb-6 p-4">
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          <MultiSelectDropdown label={basis === "carbon" || basis === "environmental" ? "Outcome" : "Commodity"} options={commodityOptions} selected={commodities} onChange={setCommodities} />
          <MultiSelectDropdown label="Organization" options={organizationIds} labels={organizationNames} selected={selectedOrganizations} onChange={setSelectedOrganizations} />
          <MultiSelectDropdown label="State" options={US_STATES} selected={states} onChange={setStates} />
          <MultiSelectDropdown label="Certifications" options={certifications.labels} titles={certifications.titles} selected={selectedCertifications} onChange={setSelectedCertifications} />
          <MultiSelectDropdown label="Sustainability Attributes" options={sustainabilityAttributes.labels} titles={sustainabilityAttributes.titles} selected={selectedSustainabilityAttributes} onChange={setSelectedSustainabilityAttributes} />
          <MultiSelectDropdown label="Specialty Attributes" options={specialtyAttributes.labels} titles={specialtyAttributes.titles} selected={selectedSpecialtyAttributes} onChange={setSelectedSpecialtyAttributes} />
          <MultiSelectDropdown label="Conservation Practices" options={practices.labels} titles={practices.titles} selected={selectedPractices} onChange={setSelectedPractices} />
          <div>
            <label className="label">Quantity Min</label>
            <NumberInput value={quantityMin} onChange={(v) => setQuantityMin(v)} />
          </div>
          <div>
            <label className="label">Quantity Max</label>
            <NumberInput value={quantityMax} onChange={(v) => setQuantityMax(v)} />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button className="btn-primary" onClick={() => search()}>Apply Filters</button>
          {hasFilters && <button className="btn-ghost" onClick={clearFilters}>Clear Filters</button>}
        </div>
      </div>

      {!offers ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : offers.length === 0 ? (
        <EmptyState title="No matching supply" hint="Try adjusting your filters." />
      ) : (
        <div className="space-y-3">
          {offers.map((o) => (
            <SupplyOfferCard
              key={o.id}
              offer={o}
              responded={respondedTo.has(o.id)}
              responding={respondingOffer?.id === o.id}
              onRespond={() => setRespondingOffer(o)}
            />
          ))}
        </div>
      )}

      {respondingOffer && (
        <RespondAmountModal
          requestedAmount={respondingOffer.remaining_volume ?? respondingOffer.expected_volume}
          unit={respondingOffer.uom}
          onConfirm={confirmRespond}
          onCancel={() => setRespondingOffer(null)}
        />
      )}
    </div>
  );
}

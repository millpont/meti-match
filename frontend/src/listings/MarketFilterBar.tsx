import { useEffect, useState } from "react";
import { api } from "../api";
import { MultiSelectDropdown, NumberInput } from "../ui";
import { US_STATES } from "../constants";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import type { AssetClass, BidFilters, OfferFilters, Organization } from "../types";
import { BID_TYPE_LABELS, GRAIN_COMMODITIES } from "./constants";
import { COUNTRIES } from "../constants";
import { ASSET_CLASS_LABELS, OUTCOME_LABELS } from "./environmental";

const BID_TYPES = Object.keys(BID_TYPE_LABELS);
const MARKET_OPTIONS = Object.keys(ASSET_CLASS_LABELS) as AssetClass[];
const COMMODITY_OPTIONS = [...GRAIN_COMMODITIES, ...OUTCOME_LABELS];


/** One filter bar driving both of the Marketplace Hub's columns at once (item 72 — harmonizes
 * the hub with the per-role filter pickers everywhere else in the app, since OffersBoard/
 * BidBrowseTable had none between them before). Commodity, Attributes, and Quantity apply to
 * both columns; State/Certifications/Practices only narrow Grower Listings (offers have no
 * other location/practice dimension); Bid Type/Destination Country only narrow Buyer Listings
 * (bids have neither concept) — scope is called out in one caption line below the grid rather
 * than per-label, so a long label never wraps and throws off that row's alignment. */
export default function MarketFilterBar({
  onApply, initialOrganizations,
}: {
  onApply: (offerFilters: OfferFilters, bidFilters: BidFilters) => void;
  /** Pre-selected organization(s) — set when the Directory deep-links in to one account's listings. */
  initialOrganizations?: string[];
}) {
  const [markets, setMarkets] = useState<AssetClass[]>([]);
  const [commodities, setCommodities] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [selectedOrganizations, setSelectedOrganizations] = useState<string[]>(initialOrganizations ?? []);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedSustainabilityAttributes, setSelectedSustainabilityAttributes] = useState<string[]>([]);
  const [selectedSpecialtyAttributes, setSelectedSpecialtyAttributes] = useState<string[]>([]);
  const [selectedPractices, setSelectedPractices] = useState<string[]>([]);
  const [selectedCertifications, setSelectedCertifications] = useState<string[]>([]);
  const [bidTypes, setBidTypes] = useState<string[]>([]);
  const [destinationCountries, setDestinationCountries] = useState<string[]>([]);
  const [quantityMin, setQuantityMin] = useState("");
  const [quantityMax, setQuantityMax] = useState("");

  const sustainabilityAttributes = useTaxonomyTerms("attribute", "sustainability");
  const specialtyAttributes = useTaxonomyTerms("attribute", "specialty");
  const practices = useTaxonomyTerms("practice");
  const certifications = useTaxonomyTerms("certification");

  // Option list for the Organization filter. Values are account ids (names aren't unique), with
  // the name supplied separately as the display label — see MultiSelectDropdown's `labels` prop.
  useEffect(() => {
    api.organizations().then((r) => setOrganizations(r.organizations)).catch(() => setOrganizations([]));
  }, []);
  const organizationIds = organizations.map((o) => o.account_id);
  const organizationNames: Record<string, string> = {};
  for (const o of organizations) organizationNames[o.account_id] = o.name || "Unnamed organization";

  const apply = () => {
    const attributes = [...selectedSustainabilityAttributes, ...selectedSpecialtyAttributes];
    onApply(
      { assetClasses: markets, commodities, states, attributes, practices: selectedPractices, certifications: selectedCertifications, quantityMin, quantityMax, organizations: selectedOrganizations },
      { assetClasses: markets, commodities, bidTypes, attributes, destinationCountries, quantityMin, quantityMax, organizations: selectedOrganizations },
    );
  };

  // Initial load for both columns — unfiltered, unless the Directory deep-linked us in with an
  // organization already selected.
  useEffect(() => { apply(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const hasFilters =
    markets.length > 0 || commodities.length > 0 || states.length > 0 || selectedSustainabilityAttributes.length > 0 ||
    selectedSpecialtyAttributes.length > 0 || selectedPractices.length > 0 || selectedCertifications.length > 0 ||
    bidTypes.length > 0 || destinationCountries.length > 0 || selectedOrganizations.length > 0 ||
    !!quantityMin || !!quantityMax;

  const clear = () => {
    setMarkets([]);
    setCommodities([]);
    setStates([]);
    setSelectedSustainabilityAttributes([]);
    setSelectedSpecialtyAttributes([]);
    setSelectedPractices([]);
    setSelectedCertifications([]);
    setBidTypes([]);
    setDestinationCountries([]);
    setSelectedOrganizations([]);
    setQuantityMin("");
    setQuantityMax("");
    onApply({}, {});
  };

  return (
    <div className="card mb-6 p-4">
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        <MultiSelectDropdown label="Market" options={MARKET_OPTIONS} labels={ASSET_CLASS_LABELS} selected={markets} onChange={(v) => setMarkets(v as AssetClass[])} />
        <MultiSelectDropdown label="Commodity / Outcome" options={COMMODITY_OPTIONS} selected={commodities} onChange={setCommodities} />
        <MultiSelectDropdown label="Organization" options={organizationIds} labels={organizationNames} selected={selectedOrganizations} onChange={setSelectedOrganizations} />
        <MultiSelectDropdown label="Sustainability Attributes" options={sustainabilityAttributes.labels} titles={sustainabilityAttributes.titles} selected={selectedSustainabilityAttributes} onChange={setSelectedSustainabilityAttributes} />
        <MultiSelectDropdown label="Specialty Attributes" options={specialtyAttributes.labels} titles={specialtyAttributes.titles} selected={selectedSpecialtyAttributes} onChange={setSelectedSpecialtyAttributes} />
        <div>
          <label className="label">Quantity Min</label>
          <NumberInput value={quantityMin} onChange={(v) => setQuantityMin(v)} />
        </div>
        <div>
          <label className="label">Quantity Max</label>
          <NumberInput value={quantityMax} onChange={(v) => setQuantityMax(v)} />
        </div>
        <MultiSelectDropdown label="State" options={US_STATES} selected={states} onChange={setStates} />
        <MultiSelectDropdown label="Certifications" options={certifications.labels} titles={certifications.titles} selected={selectedCertifications} onChange={setSelectedCertifications} />
        <MultiSelectDropdown label="Practices" options={practices.labels} titles={practices.titles} selected={selectedPractices} onChange={setSelectedPractices} />
        <MultiSelectDropdown label="Bid Type" options={BID_TYPES} selected={bidTypes} onChange={setBidTypes} />
        <MultiSelectDropdown label="Destination Country" options={COUNTRIES} selected={destinationCountries} onChange={setDestinationCountries} />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Market, Commodity / Outcome, Organization, Attributes (both Sustainability and Specialty), and Quantity narrow both columns below. State, Certifications, and
        Practices narrow Grower Listings only; Bid Type and Destination Country narrow Buyer
        Listings only.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button className="btn-primary" onClick={apply}>Apply Filters</button>
        {hasFilters && <button className="btn-ghost" onClick={clear}>Clear Filters</button>}
      </div>
    </div>
  );
}

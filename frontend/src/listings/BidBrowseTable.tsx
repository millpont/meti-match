import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { EmptyState, MultiSelectDropdown, Spinner, NumberInput } from "../ui";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import type { Bid, BidFilters, Organization } from "../types";
import { BID_TYPE_LABELS, GRAIN_COMMODITIES } from "./constants";
import { COUNTRIES } from "../constants";
import BidCard from "./BidCard";
import RespondAmountModal from "./RespondAmountModal";

const BID_TYPES = Object.keys(BID_TYPE_LABELS);

/** Browse open buyer bids and respond to one. Shared between grower and program operator
 * (pages 9/12 in the mockup are the same screen for both roles), and also used read-only-ish
 * in the marketplace hub — there, `externalFilters` comes from the hub's shared MarketFilterBar
 * instead of the filter card below, which is hidden in that mode. */
export default function BidBrowseTable({ externalFilters }: { externalFilters?: BidFilters } = {}) {
  const [commodities, setCommodities] = useState<string[]>([]);
  const [bidTypes, setBidTypes] = useState<string[]>([]);
  const [selectedSustainabilityAttributes, setSelectedSustainabilityAttributes] = useState<string[]>([]);
  const [selectedSpecialtyAttributes, setSelectedSpecialtyAttributes] = useState<string[]>([]);
  const [destinationCountries, setDestinationCountries] = useState<string[]>([]);
  const [selectedOrganizations, setSelectedOrganizations] = useState<string[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [quantityMin, setQuantityMin] = useState("");
  const [quantityMax, setQuantityMax] = useState("");
  const [bids, setBids] = useState<Bid[] | null>(null);
  const [respondedTo, setRespondedTo] = useState<Set<string>>(new Set());
  const [respondingBid, setRespondingBid] = useState<Bid | null>(null);
  const [hasInventory, setHasInventory] = useState(false);
  const sustainabilityAttributes = useTaxonomyTerms("attribute", "sustainability");
  const specialtyAttributes = useTaxonomyTerms("attribute", "specialty");
  // Guards against an earlier, slower request resolving after a later one and overwriting it
  // with stale results (see SupplySearch.tsx, same bug class — whichever request happens to
  // finish last otherwise wins regardless of which filters are currently selected).
  const latestRequestId = useRef(0);

  useEffect(() => {
    api.me().then((r) => setHasInventory(r.role === "grower" || r.role === "program_operator")).catch(() => {});
  }, []);

  // Only needed for this component's own filter card, which is hidden in marketplace-hub mode.
  useEffect(() => {
    if (externalFilters) return;
    api.organizations().then((r) => setOrganizations(r.organizations)).catch(() => setOrganizations([]));
  }, [externalFilters]);
  const organizationIds = organizations.map((o) => o.account_id);
  const organizationNames: Record<string, string> = {};
  for (const o of organizations) organizationNames[o.account_id] = o.name || "Unnamed organization";

  const search = (overrideFilters?: BidFilters) => {
    const requestId = ++latestRequestId.current;
    const f = overrideFilters ?? externalFilters ?? {
      commodities, bidTypes,
      attributes: [...selectedSustainabilityAttributes, ...selectedSpecialtyAttributes],
      destinationCountries, quantityMin, quantityMax, organizations: selectedOrganizations,
    };
    api.browseBids(f)
      .then((r) => { if (requestId === latestRequestId.current) setBids(r.bids); })
      .catch(() => { if (requestId === latestRequestId.current) setBids([]); });
  };

  const hasFilters =
    commodities.length > 0 || bidTypes.length > 0 || selectedSustainabilityAttributes.length > 0 ||
    selectedSpecialtyAttributes.length > 0 || destinationCountries.length > 0 ||
    selectedOrganizations.length > 0 || !!quantityMin || !!quantityMax;

  const clearFilters = () => {
    setCommodities([]);
    setBidTypes([]);
    setSelectedSustainabilityAttributes([]);
    setSelectedSpecialtyAttributes([]);
    setDestinationCountries([]);
    setSelectedOrganizations([]);
    setQuantityMin("");
    setQuantityMax("");
    search({});
  };

  useEffect(() => {
    api.myResponses()
      .then((r) => setRespondedTo(new Set(r.made_by_me.filter((x) => x.listing_type === "bid").map((x) => x.listing_id))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(externalFilters)]);

  const confirmRespond = async (amount: string, marketingYear?: string) => {
    if (!respondingBid) return;
    await api.respondToBid(respondingBid.id, { proposedVolume: amount, marketingYear });
    setRespondedTo((s) => new Set(s).add(respondingBid.id));
    setRespondingBid(null);
  };

  return (
    <div>
      {!externalFilters && (
        <div className="card mb-4 p-4">
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            <MultiSelectDropdown label="Commodity" options={GRAIN_COMMODITIES} selected={commodities} onChange={setCommodities} />
            <MultiSelectDropdown label="Organization" options={organizationIds} labels={organizationNames} selected={selectedOrganizations} onChange={setSelectedOrganizations} />
            <MultiSelectDropdown label="Bid Type" options={BID_TYPES} selected={bidTypes} onChange={setBidTypes} />
            <MultiSelectDropdown label="Required Sustainability Attributes" options={sustainabilityAttributes.labels} titles={sustainabilityAttributes.titles} selected={selectedSustainabilityAttributes} onChange={setSelectedSustainabilityAttributes} />
            <MultiSelectDropdown label="Required Specialty Attributes" options={specialtyAttributes.labels} titles={specialtyAttributes.titles} selected={selectedSpecialtyAttributes} onChange={setSelectedSpecialtyAttributes} />
            <MultiSelectDropdown label="Destination Country" options={COUNTRIES} selected={destinationCountries} onChange={setDestinationCountries} />
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
      )}

      {!bids ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : bids.length === 0 ? (
        <EmptyState title="No matching bids" hint="Try adjusting your filters, or check back soon." />
      ) : (
        <div className="space-y-3">
          {bids.map((b) => (
            <BidCard
              key={b.id}
              bid={b}
              responded={respondedTo.has(b.id)}
              responding={respondingBid?.id === b.id}
              onRespond={() => setRespondingBid(b)}
            />
          ))}
        </div>
      )}

      {respondingBid && (
        <RespondAmountModal
          requestedAmount={respondingBid.remaining_quantity ?? respondingBid.quantity}
          unit={respondingBid.bid_type === "acres_for_contracting" ? "acres" : "MT"}
          allowPartial={respondingBid.allow_partial}
          forGrowerBidInventory={hasInventory ? {
            commodity: respondingBid.commodity,
            quantityBasis: respondingBid.bid_type === "acres_for_contracting" ? "acres" : "grain",
          } : undefined}
          onConfirm={confirmRespond}
          onCancel={() => setRespondingBid(null)}
        />
      )}
    </div>
  );
}

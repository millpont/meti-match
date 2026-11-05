import { useState } from "react";
import OffersBoard from "../listings/OffersBoard";
import BidBrowseTable from "../listings/BidBrowseTable";
import MarketFilterBar from "../listings/MarketFilterBar";
import type { BidFilters, OfferFilters } from "../types";

/** The cross-role marketplace hub (page 6): both boards side by side, reachable by any
 * authenticated role regardless of their own dashboard. One shared filter bar drives both
 * columns at once (item 72) instead of each column having its own separate filter UI.
 *
 * `initialOrganization` is how the Directory deep-links in ("View their listings") — it seeds the
 * Organization filter so both columns open already narrowed to that one account. */
export default function MarketplaceHub({ initialOrganization }: { initialOrganization?: string | null } = {}) {
  const seedOrganizations = initialOrganization ? [initialOrganization] : undefined;
  const [offerFilters, setOfferFilters] = useState<OfferFilters>(
    seedOrganizations ? { organizations: seedOrganizations } : {},
  );
  const [bidFilters, setBidFilters] = useState<BidFilters>(
    seedOrganizations ? { organizations: seedOrganizations } : {},
  );

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-slate-900">Global Grain Marketplace Hub</h1>
      <p className="mb-6 text-sm text-slate-600">Browse supply offers and buyer bids across the whole marketplace.</p>

      <MarketFilterBar
        initialOrganizations={seedOrganizations}
        onApply={(o, b) => { setOfferFilters(o); setBidFilters(b); }}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Grower Listings</h2>
          <OffersBoard filters={offerFilters} />
        </div>
        <div>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Buyer Listings</h2>
          <BidBrowseTable externalFilters={bidFilters} />
        </div>
      </div>
    </div>
  );
}

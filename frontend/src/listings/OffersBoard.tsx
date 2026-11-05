import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { EmptyState, Spinner } from "../ui";
import type { Offer, OfferFilters } from "../types";
import SupplyOfferCard from "./SupplyOfferCard";

/** Read-only-ish browse of published offers, for the cross-role marketplace hub — the buyer's
 * dedicated Supply tab (SupplySearch) has its own richer filter UI + RFQ creation; this is the
 * simpler shared view any role can see, filtered by the hub's own shared MarketFilterBar. */
export default function OffersBoard({ filters }: { filters: OfferFilters }) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [respondedTo, setRespondedTo] = useState<Set<string>>(new Set());
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against an earlier, slower request resolving after a later one and overwriting it
  // with stale results (see SupplySearch.tsx, same bug class).
  const latestRequestId = useRef(0);

  const load = () => {
    const requestId = ++latestRequestId.current;
    api.browseOffers(filters)
      .then((r) => { if (requestId === latestRequestId.current) setOffers(r.offers); })
      .catch(() => { if (requestId === latestRequestId.current) setOffers([]); });
    api.myResponses()
      .then((r) => setRespondedTo(new Set(r.made_by_me.filter((x) => x.listing_type === "offer").map((x) => x.listing_id))))
      .catch(() => {});
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [JSON.stringify(filters)]);

  const respond = async (offerId: string) => {
    setRespondingId(offerId);
    setError(null);
    try {
      await api.respondToOffer(offerId);
      setRespondedTo((s) => new Set(s).add(offerId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setRespondingId(null);
    }
  };

  if (!offers) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (offers.length === 0) return <EmptyState title="No published offers right now" />;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {offers.map((o) => (
        <SupplyOfferCard
          key={o.id}
          offer={o}
          responded={respondedTo.has(o.id)}
          responding={respondingId === o.id}
          onRespond={() => respond(o.id)}
        />
      ))}
    </div>
  );
}

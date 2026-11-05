import { useState } from "react";
import PublicProfileModal from "./PublicProfileModal";

/** "View Profile" affordance wrapping an account id — opens PublicProfileModal on click. Drop
 * this in anywhere a counterparty's name/id is already available (see SupplyOfferCard.tsx,
 * BidCard.tsx) to answer Phase 9 item 71 ("see profile of who the offer is from"). Shows the
 * actual entity name when known (e.g. offer.created_by_name) rather than a generic label, so a
 * card with several names on it (grower, on-behalf-of, etc.) is unambiguous about whose profile
 * it opens. */
export default function ProfileLink({ accountId, name, className }: { accountId: string; name?: string | null; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className ?? "text-xs font-medium text-brand-green hover:underline"}
        onClick={() => setOpen(true)}
      >
        {name ? `View ${name}'s Profile` : "View Profile"}
      </button>
      {open && <PublicProfileModal accountId={accountId} onClose={() => setOpen(false)} />}
    </>
  );
}

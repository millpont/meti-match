import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Deal } from "../types";
import { EmptyState, Spinner } from "../ui";
import DealCard from "./DealCard";

// Superadmin-only oversight. Listings now auto-publish (approval is the creator's job — they
// accept/decline interested parties in Matches), so this is a moderation view: see every live
// listing and take one down if needed.
export default function Admin() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDeals((await api.adminDeals()).deals);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function remove(dealId: string) {
    if (!confirm("Remove this listing for everyone? This cannot be undone.")) return;
    setBusy(dealId);
    try {
      await api.removeDeal(dealId);
      setDeals((prev) => prev.filter((d) => d.id !== dealId));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">All listings</h2>
        <p className="text-sm text-slate-500">
          Listings publish automatically. Remove any that violate policy — creators approve their
          own interested parties in Matches.
        </p>
      </div>
      {deals.length === 0 ? (
        <EmptyState title="No listings yet" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {deals.map((d) => (
            <div key={d.id} className="space-y-2">
              <DealCard deal={d} />
              <button
                className="btn-ghost w-full text-xs"
                disabled={busy === d.id}
                onClick={() => remove(d.id)}
              >
                {busy === d.id ? "Removing…" : "Remove listing"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

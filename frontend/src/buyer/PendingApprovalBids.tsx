import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge } from "../ui";
import { fromAcres } from "../units";
import type { Bid } from "../types";

/** Bids a service provider (Trader) wants to place on this buyer's behalf, awaiting approval —
 * see bids_routes.py's on_behalf_of_buyer_account_id handling. Nothing renders when empty. */
export default function PendingApprovalBids() {
  const [bids, setBids] = useState<Bid[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.bidsPendingApproval().then((r) => setBids(r.bids)).catch(() => setBids([]));
  }, []);

  const approve = async (b: Bid) => {
    setBusyId(b.id);
    setError(null);
    try {
      await api.approveBid(b.id);
      setBids((bs) => bs && bs.filter((x) => x.id !== b.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (b: Bid) => {
    if (!confirm(`Decline this bid from ${b.service_provider_name || "the service provider"}? It won't be published.`)) return;
    setBusyId(b.id);
    setError(null);
    try {
      await api.declineBid(b.id);
      setBids((bs) => bs && bs.filter((x) => x.id !== b.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  if (!bids || bids.length === 0) return null;

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-slate-900">Awaiting Your Approval</h2>
        <Badge tone="amber">{bids.length}</Badge>
      </div>
      <p className="text-sm text-slate-600">
        A service provider wants to place this bid on your behalf — it won't be listed until you approve it.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="space-y-2">
        {bids.map((b) => {
          const isAcresBid = b.bid_type === "acres_for_contracting";
          const displayQuantity = isAcresBid && b.quantity != null ? fromAcres(b.quantity, b.area_unit || "acres") : b.quantity;
          return (
          <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-edge p-3">
            <div>
              <div className="text-sm font-medium text-slate-800">
                {b.commodity}{b.variety ? ` — ${b.variety}` : ""} · {displayQuantity != null ? (isAcresBid ? displayQuantity.toFixed(1) : displayQuantity) : "—"} {isAcresBid ? (b.area_unit || "acres") : "MT"}
              </div>
              <div className="text-xs text-slate-500">From {b.service_provider_name || "your service provider"}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost !py-1.5 !px-3 text-xs text-red-600"
                disabled={busyId === b.id}
                onClick={() => decline(b)}
              >
                Decline
              </button>
              <button
                type="button"
                className="btn-primary !py-1.5 !px-3 text-xs"
                disabled={busyId === b.id}
                onClick={() => approve(b)}
              >
                {busyId === b.id ? "…" : "Approve"}
              </button>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

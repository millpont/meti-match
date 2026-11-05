import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge } from "../ui";
import type { Offer } from "../types";

/** Offers a program operator wants to list on this grower's behalf, awaiting approval — see
 * offers_routes.py's on_behalf_of_grower_account_id handling. Nothing to show, nothing renders
 * (no empty state) — this isn't something a grower needs a permanent reminder is empty. */
export default function PendingApprovalOffers() {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.offersPendingApproval().then((r) => setOffers(r.offers)).catch(() => setOffers([]));
  }, []);

  const approve = async (o: Offer) => {
    setBusyId(o.id);
    setError(null);
    try {
      await api.approveOffer(o.id);
      setOffers((os) => os && os.filter((x) => x.id !== o.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (o: Offer) => {
    if (!confirm(`Decline this listing from ${o.operator_name || "the operator"}? It won't be published.`)) return;
    setBusyId(o.id);
    setError(null);
    try {
      await api.declineOffer(o.id);
      setOffers((os) => os && os.filter((x) => x.id !== o.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  if (!offers || offers.length === 0) return null;

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-slate-900">Awaiting Your Approval</h2>
        <Badge tone="amber">{offers.length}</Badge>
      </div>
      <p className="text-sm text-slate-600">
        A program operator wants to list this grain on your behalf — it won't be published until you approve it.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="space-y-2">
        {offers.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-edge p-3">
            <div>
              <div className="text-sm font-medium text-slate-800">
                {o.commodity}{o.variety ? ` — ${o.variety}` : ""} · {o.expected_volume ?? "—"} {o.uom}
                {o.acres_offered != null && ` · ${o.acres_offered} acres`}
              </div>
              <div className="text-xs text-slate-500">From {o.operator_name || "your program operator"}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost !py-1.5 !px-3 text-xs text-red-600"
                disabled={busyId === o.id}
                onClick={() => decline(o)}
              >
                Decline
              </button>
              <button
                type="button"
                className="btn-primary !py-1.5 !px-3 text-xs"
                disabled={busyId === o.id}
                onClick={() => approve(o)}
              >
                {busyId === o.id ? "…" : "Approve"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

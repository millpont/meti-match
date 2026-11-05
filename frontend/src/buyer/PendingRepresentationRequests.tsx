import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge } from "../ui";
import type { BuyerRepresentation } from "../types";

/** Service providers (Traders) asking to represent this buyer — approving lets them place bids
 * and manage agreements on the buyer's behalf. Nothing renders when there's nothing pending. */
export default function PendingRepresentationRequests() {
  const [requests, setRequests] = useState<BuyerRepresentation[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.pendingRepresentationRequests().then((r) => setRequests(r.representations)).catch(() => setRequests([]));
  }, []);

  const approve = async (r: BuyerRepresentation) => {
    setBusyId(r.id);
    setError(null);
    try {
      await api.approveRepresentation(r.id);
      setRequests((rs) => rs && rs.filter((x) => x.id !== r.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (r: BuyerRepresentation) => {
    if (!confirm(`Decline ${r.service_provider_name || "this service provider"}'s request to represent you?`)) return;
    setBusyId(r.id);
    setError(null);
    try {
      await api.declineRepresentation(r.id);
      setRequests((rs) => rs && rs.filter((x) => x.id !== r.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  if (!requests || requests.length === 0) return null;

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-slate-900">Representation Requests</h2>
        <Badge tone="amber">{requests.length}</Badge>
      </div>
      <p className="text-sm text-slate-600">
        Approving lets this service provider place bids and manage agreements on your behalf.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="space-y-2">
        {requests.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-lg border border-brand-edge p-3">
            <span className="text-sm font-medium text-slate-800">{r.service_provider_name || "Unnamed service provider"}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost !py-1.5 !px-3 text-xs text-red-600"
                disabled={busyId === r.id}
                onClick={() => decline(r)}
              >
                Decline
              </button>
              <button
                type="button"
                className="btn-primary !py-1.5 !px-3 text-xs"
                disabled={busyId === r.id}
                onClick={() => approve(r)}
              >
                {busyId === r.id ? "…" : "Approve"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

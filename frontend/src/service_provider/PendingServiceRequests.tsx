import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Spinner } from "../ui";
import type { ServiceRequest } from "../types";
import ServiceRequestThread from "../services/ServiceRequestThread";

/** A Service Provider's inbox of pending requests — accepting/declining just resolves the
 * request itself (unlike buyer_representations, this grants no on-behalf-of capability).
 * Accepted requests move to their own section below with the chat thread attached — previously
 * accepting a request just removed it from view with no way to follow up. */
export default function PendingServiceRequests() {
  const [requests, setRequests] = useState<ServiceRequest[] | null>(null);
  const [accepted, setAccepted] = useState<ServiceRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.pendingServiceRequests("pending").then((r) => setRequests(r.requests)).catch(() => setRequests([]));
  const loadAccepted = () => api.pendingServiceRequests("accepted").then((r) => setAccepted(r.requests)).catch(() => setAccepted([]));

  useEffect(() => { load(); loadAccepted(); }, []);

  const accept = async (r: ServiceRequest) => {
    setBusyId(r.id);
    setError(null);
    try {
      await api.acceptServiceRequest(r.id);
      setRequests((rs) => rs && rs.filter((x) => x.id !== r.id));
      loadAccepted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (r: ServiceRequest) => {
    if (!confirm(`Decline ${r.requester_name || "this request"}?`)) return;
    setBusyId(r.id);
    setError(null);
    try {
      await api.declineServiceRequest(r.id);
      setRequests((rs) => rs && rs.filter((x) => x.id !== r.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  if (!requests) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-slate-900">Service Requests</h2>
        {requests.length > 0 && <Badge tone="amber">{requests.length}</Badge>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {requests.length === 0 ? (
        <p className="text-sm text-slate-500">No pending service requests right now.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-brand-edge p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{r.requester_name || "Unnamed requester"}</span>
                  {r.service_category && <Badge tone="blue">{r.service_category}</Badge>}
                </div>
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
                    onClick={() => accept(r)}
                  >
                    {busyId === r.id ? "…" : "Accept"}
                  </button>
                </div>
              </div>
              {r.message && <p className="mt-1.5 text-sm text-slate-600">{r.message}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 border-t border-brand-edge pt-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Accepted</h3>
          {accepted && accepted.length > 0 && <Badge tone="green">{accepted.length}</Badge>}
        </div>
        {!accepted ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : accepted.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No accepted requests yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {accepted.map((r) => (
              <div key={r.id} className="rounded-lg border border-brand-edge p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{r.requester_name || "Unnamed requester"}</span>
                  {r.service_category && <Badge tone="blue">{r.service_category}</Badge>}
                </div>
                {r.message && <p className="mt-1.5 text-sm text-slate-600">{r.message}</p>}
                <ServiceRequestThread requestId={r.id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

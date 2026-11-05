import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Spinner } from "../ui";
import type { ServiceRequest, ServiceRequestStatus } from "../types";
import ServiceRequestThread from "./ServiceRequestThread";

const STATUS_TONE: Record<ServiceRequestStatus, "amber" | "green" | "red"> = {
  pending: "amber", accepted: "green", declined: "red",
};

/** Requests I've sent to Service Providers — the request itself is created from
 * ServiceProviderDirectory.tsx; this is just the resulting list + cancel-while-pending. */
export default function MyServiceRequests() {
  const [requests, setRequests] = useState<ServiceRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.myServiceRequests().then((r) => setRequests(r.requests)).catch(() => setRequests([]));

  useEffect(() => { load(); }, []);

  const cancel = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.cancelServiceRequest(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  if (!requests) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-slate-900">Your Service Requests</h2>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {requests.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">You haven&rsquo;t requested any services yet.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-brand-edge p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">{r.service_provider_name || "Unnamed provider"}</span>
                  {r.service_category && <Badge tone="blue">{r.service_category}</Badge>}
                  <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                </div>
                {r.status === "pending" && (
                  <button type="button" className="text-xs text-slate-500 hover:text-red-600" disabled={busyId === r.id} onClick={() => cancel(r.id)}>
                    {busyId === r.id ? "…" : "Cancel Request"}
                  </button>
                )}
              </div>
              {r.message && <p className="mt-1.5 text-sm text-slate-600">{r.message}</p>}
              {r.status === "accepted" && <ServiceRequestThread requestId={r.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

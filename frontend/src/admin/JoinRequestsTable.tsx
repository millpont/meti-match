import { useEffect, useState } from "react";
import { api } from "../api";
import { EmptyState, Spinner } from "../ui";
import type { JoinRequest } from "../types";

/** A superadmin backstop for account_join_requests — normally decided by the target company's
 * own admin (see ../CompanyAdminBell.tsx), this covers a company with no admin available yet.
 * See admin_routes.py's /api/admin/join-requests. */
export default function JoinRequestsTable() {
  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.adminJoinRequests().then((r) => setRequests(r.requests)).catch(() => setRequests([]));
  useEffect(() => { load(); }, []);

  const decide = async (r: JoinRequest, approve: boolean) => {
    setBusyId(r.id);
    setError(null);
    try {
      await (approve ? api.adminApproveJoinRequest(r.id) : api.adminDeclineJoinRequest(r.id));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  if (!requests) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {requests.length === 0 ? (
        <EmptyState title="No pending join requests" hint="A login asking to join an existing company shows up here until a company admin decides it." />
      ) : (
        requests.map((r) => (
          <div key={r.id} className="card flex items-center justify-between gap-3 p-4">
            <div>
              <div className="font-medium text-slate-900">{r.requester_name || r.requester_email || "Someone"}</div>
              {r.requester_name && r.requester_email && (
                <div className="text-xs text-slate-500">{r.requester_email}</div>
              )}
              <div className="text-sm text-slate-600">
                wants to join <span className="font-medium">{r.account_name}</span> as {r.role.replace(/_/g, " ")}
              </div>
              <div className="mt-1 text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString()}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="btn-primary !py-1.5 !px-3 text-xs"
                disabled={busyId === r.id}
                onClick={() => decide(r, true)}
              >
                Approve
              </button>
              <button
                type="button"
                className="btn-ghost !py-1.5 !px-3 text-xs"
                disabled={busyId === r.id}
                onClick={() => decide(r, false)}
              >
                Decline
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

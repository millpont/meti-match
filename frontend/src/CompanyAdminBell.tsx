import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { UsersIcon } from "./icons";
import type { JoinRequest } from "./types";

const POLL_MS = 30_000;

/** Header badge for a company admin — the first person to register a company (see
 * migrations/0024_company_join_requests.sql) — showing other logins asking to join their
 * company, with inline approve/decline. Only rendered when `me.is_company_admin` (App.tsx). */
export default function CompanyAdminBell() {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => api.companyJoinRequests().then((r) => setRequests(r.requests)).catch(() => {});

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  const decide = async (r: JoinRequest, approve: boolean) => {
    setBusyId(r.id);
    setError(null);
    try {
      await (approve ? api.approveCompanyJoinRequest(r.id) : api.declineCompanyJoinRequest(r.id));
      setRequests((rs) => rs.filter((x) => x.id !== r.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Join requests"
        title="Company join requests"
      >
        <UsersIcon />
        {requests.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-gold px-1 text-[10px] font-bold text-white">
            {requests.length > 9 ? "9+" : requests.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-lg border border-brand-edge bg-white shadow-lg">
          <div className="border-b border-brand-edge px-3 py-2 text-sm font-semibold text-slate-900">
            Join requests
          </div>
          {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}
          <div className="max-h-96 overflow-y-auto">
            {requests.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">No pending requests.</p>
            ) : (
              requests.map((r) => (
                <div key={r.id} className="border-b border-brand-edge px-3 py-2.5 text-sm last:border-b-0">
                  <div className="font-medium text-slate-800">{r.requester_name || r.requester_email || "Someone"}</div>
                  {r.requester_email && (
                    <div className="text-xs text-slate-500">{r.requester_email}</div>
                  )}
                  <div className="mt-0.5 text-xs text-slate-500">
                    wants to join as {r.role.replace(/_/g, " ")}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="btn-primary !py-1 !px-2.5 text-xs"
                      disabled={busyId === r.id}
                      onClick={() => decide(r, true)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn-ghost !py-1 !px-2.5 text-xs"
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
        </div>
      )}
    </div>
  );
}

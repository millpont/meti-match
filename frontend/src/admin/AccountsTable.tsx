import { Fragment, useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Spinner } from "../ui";
import type { AccountDocument, AdminAccount } from "../types";

const ROLE_LABELS: Record<string, string> = {
  grower: "Grower", program_operator: "Program Operator",
  international_buyer: "Buyer", service_provider: "Service Provider", admin: "Admin",
};

export default function AccountsTable({ approvalEnabled }: { approvalEnabled?: boolean } = {}) {
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [freezingId, setFreezingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyRoleSwitchId, setBusyRoleSwitchId] = useState<string | null>(null);
  const [busyApprovalId, setBusyApprovalId] = useState<string | null>(null);
  const [documentsFor, setDocumentsFor] = useState<string | null>(null);
  const [documents, setDocuments] = useState<AccountDocument[] | null>(null);

  useEffect(() => { api.adminAccounts().then((r) => setAccounts(r.accounts)).catch(() => setAccounts([])); }, []);

  const openDocuments = (a: AdminAccount) => {
    if (documentsFor === a.id) {
      setDocumentsFor(null);
      return;
    }
    setDocumentsFor(a.id);
    setDocuments(null);
    api.adminAccountDocuments(a.id).then((r) => setDocuments(r.documents)).catch(() => setDocuments([]));
  };

  const decideApproval = async (a: AdminAccount, approved: boolean) => {
    setBusyApprovalId(a.id);
    setError(null);
    try {
      await api.setAccountApproval(a.id, approved);
      setAccounts((as) => as && as.map((x) => (
        x.id === a.id ? { ...x, approval_status: approved ? "approved" : "declined" } : x
      )));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyApprovalId(null);
    }
  };

  const freeze = async (a: AdminAccount, frozen: boolean) => {
    setBusyId(a.id);
    setError(null);
    try {
      await api.freezeAccount(a.id, frozen, frozen ? reason.trim() : undefined);
      setAccounts((as) => as && as.map((x) => (x.id === a.id ? { ...x, frozen, frozen_reason: frozen ? (reason.trim() || null) : null } : x)));
      setFreezingId(null);
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const toggleRoleSwitching = async (a: AdminAccount) => {
    setBusyRoleSwitchId(a.id);
    setError(null);
    try {
      const enabled = !a.role_switching_enabled;
      await api.setRoleSwitchingEnabled(a.id, enabled);
      setAccounts((as) => as && as.map((x) => (x.id === a.id ? { ...x, role_switching_enabled: enabled } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyRoleSwitchId(null);
    }
  };

  if (!accounts) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="overflow-x-auto">
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-2 pr-4">Name</th>
            <th className="pb-2 pr-4">Contact</th>
            <th className="pb-2 pr-4">Role</th>
            <th className="pb-2 pr-4">Email</th>
            <th className="pb-2 pr-4">Phone</th>
            <th className="pb-2 pr-4">EIN</th>
            <th className="pb-2 pr-4">Joined</th>
            <th className="pb-2 pr-4">Status</th>
            {/* Only rendered when superadmin approval of new accounts is turned on at all
                (config.ACCOUNT_APPROVAL_REQUIRED) — with it off this table looks as it always has. */}
            {approvalEnabled && <th className="pb-2 pr-4">Approval</th>}
            <th className="pb-2 pr-4">Role Switching</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <Fragment key={a.id}>
              <tr className="border-t border-brand-edge">
                <td className="py-2 pr-4 font-medium text-slate-800">{a.name}</td>
                <td className="py-2 pr-4 text-slate-600">{a.contact_name || "—"}</td>
                <td className="py-2 pr-4"><Badge tone="slate">{ROLE_LABELS[a.role] ?? a.role}</Badge></td>
                <td className="py-2 pr-4 text-slate-600">{a.email || "—"}</td>
                <td className="py-2 pr-4 text-slate-600">{a.contact_phone || "—"}</td>
                <td className="py-2 pr-4 text-slate-600">{a.ein_last4 ? `•••${a.ein_last4}` : "—"}</td>
                <td className="py-2 pr-4 text-slate-500">{new Date(a.created_at).toLocaleDateString()}</td>
                <td className="py-2 pr-4">
                  {a.frozen ? <Badge tone="red">Frozen</Badge> : <Badge tone="green">Active</Badge>}
                </td>
                {approvalEnabled && (
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      {a.approval_status === "pending" ? <Badge tone="amber">Pending</Badge>
                        : a.approval_status === "declined" ? <Badge tone="red">Declined</Badge>
                        : <Badge tone="green">Approved</Badge>}
                      {a.approval_status !== "approved" && (
                        <button
                          type="button"
                          className="text-xs font-medium text-brand-green hover:underline"
                          disabled={busyApprovalId === a.id}
                          onClick={() => decideApproval(a, true)}
                        >
                          {busyApprovalId === a.id ? "…" : "Approve"}
                        </button>
                      )}
                      {a.approval_status === "pending" && (
                        <button
                          type="button"
                          className="text-xs font-medium text-slate-500 hover:text-red-600"
                          disabled={busyApprovalId === a.id}
                          onClick={() => decideApproval(a, false)}
                        >
                          Decline
                        </button>
                      )}
                    </div>
                  </td>
                )}
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    {a.role_switching_enabled ? <Badge tone="green">On</Badge> : <Badge tone="slate">Off</Badge>}
                    <button
                      type="button"
                      className="text-xs font-medium text-brand-green hover:underline"
                      disabled={busyRoleSwitchId === a.id}
                      onClick={() => toggleRoleSwitching(a)}
                    >
                      {busyRoleSwitchId === a.id ? "…" : a.role_switching_enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                </td>
                <td className="py-2 whitespace-nowrap">
                  <button
                    type="button"
                    className="mr-3 text-xs font-medium text-slate-500 hover:text-brand-green"
                    onClick={() => openDocuments(a)}
                  >
                    {documentsFor === a.id ? "Hide Docs" : "Docs"}
                  </button>
                  {a.frozen ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-brand-green hover:underline"
                      disabled={busyId === a.id}
                      onClick={() => freeze(a, false)}
                    >
                      {busyId === a.id ? "…" : "Unfreeze"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-xs font-medium text-slate-500 hover:text-red-600"
                      onClick={() => { setFreezingId(freezingId === a.id ? null : a.id); setReason(""); }}
                    >
                      Freeze
                    </button>
                  )}
                </td>
              </tr>
              {documentsFor === a.id && (
                <tr className="border-t border-brand-edge bg-brand-bg/40">
                  <td colSpan={approvalEnabled ? 11 : 10} className="py-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Company Documentation
                    </div>
                    {documents == null ? (
                      <p className="mt-1 text-sm text-slate-400">Loading…</p>
                    ) : documents.length === 0 ? (
                      <p className="mt-1 text-sm text-slate-400">
                        No company documentation on file — worth asking for it before approving.
                      </p>
                    ) : (
                      <div className="mt-1 space-y-1">
                        {documents.map((d) => (
                          <div key={d.id} className="flex items-center gap-3 text-sm">
                            <span className="text-slate-700">{d.label}</span>
                            {d.url && (
                              <a href={d.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-green hover:underline">
                                View
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )}
              {freezingId === a.id && (
                <tr className="border-t border-brand-edge bg-brand-bg/40">
                  <td colSpan={approvalEnabled ? 11 : 10} className="py-2">
                    <div className="flex items-center gap-2">
                      <input
                        className="field"
                        placeholder="Reason for suspension (optional)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-primary shrink-0 !py-1.5 !px-3 text-xs"
                        disabled={busyId === a.id}
                        onClick={() => freeze(a, true)}
                      >
                        {busyId === a.id ? "…" : "Confirm Freeze"}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

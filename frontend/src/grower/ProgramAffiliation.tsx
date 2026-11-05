import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Spinner } from "../ui";
import type { ProgramAffiliation as ProgramAffiliationType, ProgramOperatorOption } from "../types";

export default function ProgramAffiliation() {
  const [affiliation, setAffiliation] = useState<ProgramAffiliationType | null | undefined>(undefined);
  const [operators, setOperators] = useState<ProgramOperatorOption[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invitations, setInvitations] = useState<ProgramAffiliationType[]>([]);

  const load = () => {
    api.myProgramInvitations().then((r) => setInvitations(r.invitations)).catch(() => setInvitations([]));
    return api.myProgramAffiliation().then((r) => setAffiliation(r.affiliation)).catch(() => setAffiliation(null));
  };

  const answer = async (inv: ProgramAffiliationType, accept: boolean) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (accept) await api.acceptProgramInvitation(inv.id);
      else await api.declineProgramInvitation(inv.id);
      setNotice(accept
        ? `You've joined ${inv.program_operator_name || "the program"}. They can now include your grain in their listings.`
        : `Invitation from ${inv.program_operator_name || "the program operator"} declined — they've been notified.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    api.programOperators().then((r) => setOperators(r.program_operators)).catch(() => setOperators([]));
  }, []);

  const request = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.requestProgramAffiliation(selected);
      setNotice(`Request sent to ${operators.find((o) => o.id === selected)?.name ?? "the program operator"} — you'll get a notification when they respond.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!affiliation) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelProgramAffiliationRequest(affiliation.id);
      setNotice("Request cancelled.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (affiliation === undefined) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-slate-900">Program Affiliation</h2>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      {!affiliation && invitations.length > 0 && (
        <div className="mt-3 space-y-2">
          {invitations.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-gold bg-brand-gold/5 px-3 py-2.5">
              <div className="text-sm">
                <span className="font-medium text-slate-800">{inv.program_operator_name || "A program operator"}</span>
                <span className="text-slate-600"> invited you to join their program.</span>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-primary !px-3 !py-1 text-xs" disabled={busy} onClick={() => answer(inv, true)}>Accept</button>
                <button type="button" className="btn-ghost !px-3 !py-1 text-xs" disabled={busy} onClick={() => answer(inv, false)}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {affiliation ? (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800">{affiliation.program_operator_name}</span>
            <Badge tone={affiliation.status === "active" ? "green" : "amber"}>
              {affiliation.status === "active" ? "Active" : "Pending Approval"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {affiliation.status === "active"
              ? "You're enrolled in this program. Aggregated offers from this operator may include your grain."
              : "Waiting for the operator to approve your request."}
          </p>
          {affiliation.status === "pending" && (
            <button type="button" className="btn-ghost mt-3" disabled={busy} onClick={cancel}>
              {busy ? "…" : "Cancel Request"}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <p className="mb-3 text-sm text-slate-600">
            Join a program operator to have your grain included in their aggregated offers. This
            sends a request — the operator needs to approve it before it's active.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <select className="field max-w-xs" value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Select a program operator</option>
              {operators.map((op) => <option key={op.id} value={op.id}>{op.name}</option>)}
            </select>
            <button type="button" className="btn-primary shrink-0" disabled={!selected || busy} onClick={request}>
              {busy ? "Sending…" : "Request to Join"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, EmptyState, Spinner } from "../ui";
import type { Dispute } from "../types";
import { DISPUTE_CATEGORY_LABELS } from "../listings/constants";

const TIER_LABEL: Record<string, string> = { tribunal: "Tribunal", board_of_appeal: "Board of Appeal" };
const TRACK_LABEL: Record<string, string> = { arbitration: "Arbitration", expert_determination: "Expert Determination" };

export default function DisputesTable() {
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.adminDisputes().then((r) => setDisputes(r.disputes)).catch(() => setDisputes([]));
  useEffect(() => { load(); }, []);

  const resolve = async (d: Dispute) => {
    setBusyId(d.id);
    setError(null);
    try {
      await api.adminResolveDispute(d.id, notes);
      await load();
      setResolvingId(null);
      setNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const appeal = async (d: Dispute) => {
    setBusyId(d.id);
    setError(null);
    try {
      await api.adminAppealDispute(d.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  if (!disputes) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <GaftaPolicyPanel />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {disputes.length === 0 ? (
        <EmptyState title="No disputes" hint="Disputes raised on agreements by either party show up here." />
      ) : (
        <div className="space-y-3">
          {disputes.map((d) => (
            <div key={d.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{d.contract_summary}</span>
                    <Badge tone={d.status === "open" ? "amber" : "green"}>{d.status}</Badge>
                    <Badge tone="violet">{DISPUTE_CATEGORY_LABELS[d.category] ?? d.category}</Badge>
                    <Badge tone="blue">{TRACK_LABEL[d.resolution_track] ?? d.resolution_track}</Badge>
                    <Badge tone="slate">{TIER_LABEL[d.tier] ?? d.tier}</Badge>
                    {d.is_time_barred && <Badge tone="red">Time-Barred</Badge>}
                  </div>
                  <div className="mt-1 text-sm text-slate-700">{d.reason}</div>
                  {d.description && <div className="mt-0.5 text-sm text-slate-500">{d.description}</div>}
                  <div className="mt-1 text-xs text-slate-400">
                    Raised by {d.raised_by_name || "—"} on {new Date(d.created_at).toLocaleDateString()}
                    {d.filing_deadline && ` · Filing deadline ${new Date(d.filing_deadline).toLocaleDateString()}`}
                  </div>
                  {d.tribunal_resolution_notes && (
                    <div className="mt-2 rounded-lg bg-brand-bg p-2 text-xs text-slate-600">
                      <span className="font-medium">Tribunal resolution (appealed): </span>{d.tribunal_resolution_notes}
                    </div>
                  )}
                  {d.status === "resolved" && d.resolution_notes && (
                    <div className="mt-2 rounded-lg bg-brand-bg p-2 text-xs text-slate-600">
                      <span className="font-medium">Resolution: </span>{d.resolution_notes}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {d.status === "open" && (
                    <button
                      type="button"
                      className="btn-primary shrink-0 !py-1.5 !px-3 text-xs"
                      onClick={() => { setResolvingId(resolvingId === d.id ? null : d.id); setNotes(""); }}
                    >
                      Resolve
                    </button>
                  )}
                  {d.status === "resolved" && d.tier === "tribunal" && (
                    <button
                      type="button"
                      className="btn-ghost shrink-0 !py-1.5 !px-3 text-xs"
                      disabled={busyId === d.id}
                      onClick={() => appeal(d)}
                    >
                      {busyId === d.id ? "…" : "Send to Board of Appeal"}
                    </button>
                  )}
                </div>
              </div>
              {resolvingId === d.id && (
                <div className="mt-3 flex items-center gap-2 border-t border-brand-edge pt-3">
                  <input
                    className="field"
                    placeholder="Resolution notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary shrink-0 !py-1.5 !px-3 text-xs"
                    disabled={busyId === d.id}
                    onClick={() => resolve(d)}
                  >
                    {busyId === d.id ? "…" : "Mark Resolved"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Informational only — modeled on GAFTA/FOSFA international grain arbitration rules, not a real
 * arbitrator-assignment or institutional-filing system. See contracts_routes.py's dispute logic. */
function GaftaPolicyPanel() {
  return (
    <details className="card p-4 text-sm text-slate-600">
      <summary className="cursor-pointer font-medium text-slate-800">
        Dispute resolution policy (GAFTA / FOSFA-style)
      </summary>
      <div className="mt-3 space-y-2">
        <p>
          Quality and condition disputes are resolved by independent expert/superintendent
          determination rather than arbitration. Every other category (non-performance, force
          majeure, demurrage/laytime, price/damages) is arbitrated.
        </p>
        <p>
          Arbitrated disputes are heard first by a single arbitrator or tribunal. A resolved
          tribunal-tier dispute can be appealed to a Board of Appeal within 30 days, which
          re-hears the matter on the merits rather than doing a narrow legal review.
        </p>
        <p>
          Filing is subject to a strict time limit (90 days from the agreement's delivery window,
          or from the dispute's creation if no delivery window is on file) — a claim filed after
          that window is flagged Time-Barred.
        </p>
        <p className="text-xs text-slate-400">
          This is a policy/status model, not real arbitrator assignment or institutional
          (London-administered) case filing.
        </p>
      </div>
    </details>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, EmptyState, Spinner } from "../ui";
import type { Contract, ContractStatus, DisputeCategory } from "../types";
import { DISPUTE_CATEGORY_LABELS } from "./constants";
import { formatCurrency, formatNumber } from "../format";
import { contractUnit } from "./environmental";

const DISPUTE_CATEGORIES = Object.keys(DISPUTE_CATEGORY_LABELS) as DisputeCategory[];

const STATUS_TONE: Record<ContractStatus, "amber" | "blue" | "green"> = {
  pending: "amber", shipped: "blue", completed: "green",
};

const NEXT_STATUS: Record<ContractStatus, ContractStatus | null> = {
  pending: "shipped", shipped: "completed", completed: null,
};

const NEXT_LABEL: Record<ContractStatus, string> = {
  pending: "Mark Shipped", shipped: "Mark Completed", completed: "",
};

/** Contracts a response's acceptance produced — shared by growers/operators (as seller) and
 * buyers (as buyer); the API scopes which rows come back by the caller's role.
 * `showDisputeAction` is turned off when embedded in the admin dashboard, since an admin isn't a
 * party to the contract and the backend would reject their attempt to raise one anyway. */
export default function ContractsTable({ showDisputeAction = true }: { showDisputeAction?: boolean }) {
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [disputingId, setDisputingId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeCategory, setDisputeCategory] = useState<DisputeCategory>("other");
  const [error, setError] = useState<string | null>(null);

  const load = () => api.contracts().then((r) => setContracts(r.contracts)).catch(() => setContracts([]));
  useEffect(() => { load(); }, []);

  const advance = async (c: Contract) => {
    const next = NEXT_STATUS[c.status];
    if (!next) return;
    setBusyId(c.id);
    setError(null);
    try {
      await api.updateContractStatus(c.id, next);
      setContracts((cs) => cs && cs.map((x) => (x.id === c.id ? { ...x, status: next } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const submitDispute = async (c: Contract) => {
    if (!disputeReason.trim()) return;
    setBusyId(c.id);
    setError(null);
    try {
      const r = await api.raiseDispute(c.id, disputeReason.trim(), undefined, disputeCategory);
      setContracts((cs) => cs && cs.map((x) => (x.id === c.id ? { ...x, has_open_dispute: true } : x)));
      setDisputingId(null);
      setDisputeReason("");
      setDisputeCategory("other");
      if (r.is_time_barred) {
        setError("Dispute filed, but the 90-day filing window for this contract has passed — it's flagged as time-barred.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  if (!contracts) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (contracts.length === 0) {
    return <EmptyState title="No agreements yet" hint="Accepting a response to one of your listings creates an agreement here." />;
  }

  return (
    <div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2 pr-4">Commodity</th>
              <th className="pb-2 pr-4">Counterparty</th>
              <th className="pb-2 pr-4">Volume</th>
              <th className="pb-2 pr-4">Price</th>
              <th className="pb-2 pr-4">Delivery Window</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id} className="border-t border-brand-edge">
                <td className="py-2 pr-4 font-medium text-slate-800">
                  {c.commodity}{c.variety ? ` — ${c.variety}` : ""}
                </td>
                <td className="py-2 pr-4 text-slate-600">{c.counterparty_name || "—"}</td>
                <td className="py-2 pr-4 text-slate-600">{formatNumber(c.final_volume)} {contractUnit(c.commodity)}</td>
                <td className="py-2 pr-4 text-slate-600">{c.final_price_usd_per_mt != null ? `${formatCurrency(c.final_price_usd_per_mt)}/${contractUnit(c.commodity)}` : "—"}</td>
                <td className="py-2 pr-4 text-slate-600">
                  {c.delivery_window_start && c.delivery_window_end ? `${c.delivery_window_start} – ${c.delivery_window_end}` : "—"}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-1.5">
                    <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                    {c.has_open_dispute && <Badge tone="red">Disputed</Badge>}
                  </div>
                </td>
                <td className="py-2 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    {NEXT_STATUS[c.status] && (
                      <button
                        type="button"
                        className="text-xs font-medium text-brand-green hover:underline"
                        disabled={busyId === c.id}
                        onClick={() => advance(c)}
                      >
                        {busyId === c.id ? "…" : NEXT_LABEL[c.status]}
                      </button>
                    )}
                    {showDisputeAction && !c.has_open_dispute && (
                      <button
                        type="button"
                        className="text-xs font-medium text-slate-500 hover:text-red-600"
                        onClick={() => { setDisputingId(disputingId === c.id ? null : c.id); setDisputeReason(""); }}
                      >
                        Raise Dispute
                      </button>
                    )}
                  </div>
                  {disputingId === c.id && (
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        className="field shrink-0 !w-auto"
                        value={disputeCategory}
                        onChange={(e) => setDisputeCategory(e.target.value as DisputeCategory)}
                      >
                        {DISPUTE_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{DISPUTE_CATEGORY_LABELS[cat]}</option>
                        ))}
                      </select>
                      <input
                        className="field"
                        placeholder="Reason for dispute"
                        value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-primary shrink-0 !py-1.5 !px-3 text-xs"
                        disabled={busyId === c.id || !disputeReason.trim()}
                        onClick={() => submitDispute(c)}
                      >
                        Submit
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

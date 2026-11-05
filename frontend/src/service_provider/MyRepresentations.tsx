import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Spinner } from "../ui";
import type { BuyerRepresentation, ProgramOperatorOption } from "../types";

/** A Trader's standing relationships with the international buyers they represent — unlike a
 * grower's program affiliation, there's no "at most one" cap here (a trader may represent
 * several buyers). Each active one lets the Trader place bids and manage agreements on that
 * buyer's behalf; see CreateRfqForm's on-behalf-of picker and contracts_routes.py. */
export default function MyRepresentations() {
  const [representations, setRepresentations] = useState<BuyerRepresentation[] | null>(null);
  const [buyers, setBuyers] = useState<ProgramOperatorOption[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.myRepresentations().then((r) => setRepresentations(r.representations)).catch(() => setRepresentations([]));

  useEffect(() => {
    load();
    api.internationalBuyers().then((r) => setBuyers(r.buyers)).catch(() => setBuyers([]));
  }, []);

  const request = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.requestBuyerRepresentation(selected);
      setSelected("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.cancelRepresentationRequest(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (!representations) return <div className="flex justify-center py-8"><Spinner /></div>;

  const alreadyRequested = new Set(representations.map((r) => r.buyer_account_id));
  const availableBuyers = buyers.filter((b) => !alreadyRequested.has(b.id));

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-slate-900">Represented Buyers</h2>
      <p className="mt-0.5 text-sm text-slate-600">
        Once a buyer approves your request, you can place bids and manage agreements on their behalf.
      </p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {representations.length > 0 && (
        <div className="mt-4 space-y-2">
          {representations.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-brand-edge p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-800">{r.buyer_name || "Unnamed buyer"}</span>
                <Badge tone={r.status === "active" ? "green" : "amber"}>
                  {r.status === "active" ? "Active" : "Pending Approval"}
                </Badge>
              </div>
              {r.status === "pending" && (
                <button type="button" className="text-xs text-slate-500 hover:text-red-600" disabled={busy} onClick={() => cancel(r.id)}>
                  Cancel Request
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-brand-edge pt-4">
        <select className="field max-w-xs" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Select an international buyer</option>
          {availableBuyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button type="button" className="btn-primary shrink-0" disabled={!selected || busy} onClick={request}>
          {busy ? "Sending…" : "Request to Represent"}
        </button>
      </div>
    </div>
  );
}

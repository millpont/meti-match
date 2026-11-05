import { useEffect, useState } from "react";
import { api } from "../api";
import { NumberInput } from "../ui";
import { formatNumber } from "../format";
import { marketingYears } from "./constants";
import type { QuantityBasis } from "../types";

/** The amount-picker popup behind "respond to the total amount or a different amount" — shared
 * by both directions (a buyer responding to a grower's Offer, and a grower/operator responding
 * to a buyer's Bid). Only when a GROWER is responding to a BID does `forGrowerBidInventory`
 * apply: a Marketing Year picker appears and the amount is validated against Grower Inventory's
 * remaining balance for that commodity/year (see backend/inventory_routes.py) — that's the
 * "shared pool" the client asked for, so a bid-response draws on the same balance as the
 * grower's own Offers. */
export default function RespondAmountModal({
  requestedAmount, unit, allowPartial = true, forGrowerBidInventory, onConfirm, onCancel,
}: {
  requestedAmount: number | null;
  unit: string;
  allowPartial?: boolean;
  /** quantityBasis defaults to 'grain' — pass 'acres' for an acres_for_contracting bid, so the
   * amount is checked against the grower's separate acres inventory pool instead. */
  forGrowerBidInventory?: { commodity: string; quantityBasis?: QuantityBasis };
  onConfirm: (amount: string, marketingYear?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(requestedAmount != null ? String(requestedAmount) : "");
  const [marketingYear, setMarketingYear] = useState(marketingYears()[1] ?? "");
  const [remaining, setRemaining] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basis = forGrowerBidInventory?.quantityBasis ?? "grain";

  useEffect(() => {
    if (!forGrowerBidInventory || !marketingYear) return;
    api.growerInventoryRemaining(forGrowerBidInventory.commodity, marketingYear, basis)
      .then((r) => setRemaining(basis === "acres" ? r.remaining_acres : r.remaining_volume))
      .catch(() => setRemaining(undefined));
  }, [forGrowerBidInventory, marketingYear, basis]);

  const submit = async () => {
    const n = Number(amount);
    if (!amount || n <= 0) return setError("Enter an amount");
    if (!allowPartial && requestedAmount != null && n !== requestedAmount) {
      return setError("This buyer requires the full amount");
    }
    if (remaining != null && n > remaining) {
      return setError(`That exceeds your remaining inventory for this commodity/marketing year (${remaining.toFixed(1)} ${unit} left)`);
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(amount, forGrowerBidInventory ? marketingYear : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-slate-900">How much are you offering?</h3>
        <p className="mt-1 text-sm text-slate-600">
          {requestedAmount != null ? `Requested: ${formatNumber(requestedAmount)} ${unit}` : "Enter an amount"}
          {!allowPartial && " — full amount only."}
        </p>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4">
          <label className="label">Amount ({unit})</label>
          <NumberInput value={amount} disabled={!allowPartial} onChange={setAmount} />
        </div>

        {forGrowerBidInventory && (
          <div className="mt-3">
            <label className="label">Marketing Year (draws from your inventory)</label>
            <select className="field" value={marketingYear} onChange={(e) => setMarketingYear(e.target.value)}>
              {marketingYears().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {remaining != null && (
              <p className="mt-1 text-xs text-slate-500">
                Remaining {forGrowerBidInventory.commodity} inventory for {marketingYear}: {remaining.toFixed(1)} {unit}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
            {busy ? "Sending…" : "Respond"}
          </button>
        </div>
      </div>
    </div>
  );
}

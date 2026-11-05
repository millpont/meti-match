import { useEffect, useState } from "react";
import { api } from "../api";
import { ConfirmDialog, Spinner, NumberInput } from "../ui";
import type { AreaUnit, GrowerInventoryRow, QuantityBasis, GrainUom } from "../types";
import { GRAIN_COMMODITIES, UOM_OPTIONS, marketingYears } from "../listings/constants";

const MARKETING_YEARS = marketingYears();
const AREA_UNITS: AreaUnit[] = ["acres", "hectares"];

/** "Your Inventory" — a farm-level cap per commodity/marketing year, drawn down by both this
 * grower's own Offers and their accepted/in-flight bid-responses (see
 * backend/inventory_routes.py). Two independent pools per commodity/year — grain volume and
 * acres — since "contracting acres should follow the same inventory logic" as grain. Individual
 * offer tickets are then tracked against whichever pool they draw from, rather than each other —
 * e.g. a 1,000 MT Corn balance can't be oversubscribed by three separate 400 MT offers. */
export default function GrainInventory({ refreshSignal }: { refreshSignal?: number } = {}) {
  const [rows, setRows] = useState<GrowerInventoryRow[] | null>(null);
  const [quantityBasis, setQuantityBasis] = useState<QuantityBasis>("grain");
  const [commodity, setCommodity] = useState<string>(GRAIN_COMMODITIES[0]);
  const [marketingYear, setMarketingYear] = useState<string>(MARKETING_YEARS[1] ?? MARKETING_YEARS[0] ?? "");
  const [totalVolume, setTotalVolume] = useState("");
  const [uom, setUom] = useState<GrainUom>("bushels");
  const [totalAcres, setTotalAcres] = useState("");
  const [areaUnit, setAreaUnit] = useState<AreaUnit>("acres");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingRow, setDeletingRow] = useState<GrowerInventoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => api.growerInventory().then((r) => setRows(r.inventory)).catch(() => setRows([]));
  // Re-fetches whenever the caller bumps refreshSignal (e.g. after publishing or withdrawing a
  // listing elsewhere on the same tab) — this card otherwise only fetches once on mount, so its
  // "Remaining" figures would go stale the moment a sibling component changes what's committed.
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [refreshSignal]);

  const confirmDelete = async () => {
    if (!deletingRow) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteGrowerInventory(deletingRow.commodity, deletingRow.marketing_year, deletingRow.quantity_basis);
      setDeletingRow(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setDeleting(false);
    }
  };

  const save = async () => {
    setError(null);
    if (quantityBasis === "grain") {
      if (!totalVolume || Number(totalVolume) < 0) return setError("Total volume is required");
    } else if (!totalAcres || Number(totalAcres) < 0) {
      return setError("Total acres is required");
    }
    setSaving(true);
    try {
      if (quantityBasis === "grain") {
        await api.putGrainInventory(commodity, marketingYear, totalVolume, uom);
        setTotalVolume("");
      } else {
        await api.putAcresInventory(commodity, marketingYear, totalAcres, areaUnit);
        setTotalAcres("");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-slate-900">Your Inventory</h2>
      <p className="mt-0.5 text-sm text-slate-600">
        Set your expected total grain volume or contracting acres per commodity and marketing
        year — your Listings (and any bid responses) are tracked against this balance so you
        can't oversell it.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4">
        <div className="flex gap-1.5">
          {(["grain", "acres"] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setQuantityBasis(b)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                quantityBasis === b ? "border-brand-green bg-brand-greenLight text-brand-green" : "border-brand-edge text-slate-600"
              }`}
            >
              {b === "grain" ? "Grain" : "Acres"}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <select className="field" value={commodity} onChange={(e) => setCommodity(e.target.value)}>
            {GRAIN_COMMODITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="field" value={marketingYear} onChange={(e) => setMarketingYear(e.target.value)}>
            {MARKETING_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {quantityBasis === "grain" ? (
            <div className="flex gap-2">
              <NumberInput placeholder="Total volume" value={totalVolume}
                onChange={(v) => setTotalVolume(v)} />
              <select className="field" value={uom} onChange={(e) => setUom(e.target.value as GrainUom)}>
                {UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          ) : (
            <div className="flex gap-2">
              <NumberInput placeholder="Total acres" value={totalAcres}
                onChange={(v) => setTotalAcres(v)} />
              <select className="field" value={areaUnit} onChange={(e) => setAreaUnit(e.target.value as AreaUnit)}>
                {AREA_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}
          <button type="button" className="btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Set / Update"}
          </button>
        </div>
      </div>

      <div className="mt-5">
        {!rows ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">No inventory set yet — listings won't be capped until you add one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4">Commodity</th>
                  <th className="pb-2 pr-4">Marketing Year</th>
                  <th className="pb-2 pr-4">Basis</th>
                  <th className="pb-2 pr-4">Total</th>
                  <th className="pb-2 pr-4">Remaining</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-brand-edge">
                    <td className="py-2 pr-4 font-medium text-slate-800">{r.commodity}</td>
                    <td className="py-2 pr-4 text-slate-600">{r.marketing_year}</td>
                    <td className="py-2 pr-4 text-slate-600">{r.quantity_basis === "acres" ? "Acres" : "Grain"}</td>
                    <td className="py-2 pr-4 text-slate-600">
                      {r.quantity_basis === "grain" ? `${r.total_volume} ${r.uom}` : `${r.total_acres} ${r.area_unit}`}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">
                      {r.quantity_basis === "grain"
                        ? (r.remaining_volume != null ? `${r.remaining_volume.toFixed(1)} ${r.uom}` : "—")
                        : (r.remaining_acres != null ? `${r.remaining_acres.toFixed(1)} ${r.area_unit}` : "—")}
                    </td>
                    <td className="py-2 text-right">
                      <button type="button" className="text-xs text-slate-400 hover:text-red-600" onClick={() => setDeletingRow(r)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deletingRow && (
        <ConfirmDialog
          title="Delete this inventory entry?"
          message={`This removes your ${deletingRow.commodity} ${deletingRow.marketing_year} ${deletingRow.quantity_basis === "acres" ? "acres" : "grain"} balance. This can't be undone, and is blocked if anything is still committed against it.`}
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeletingRow(null)}
        />
      )}
    </div>
  );
}

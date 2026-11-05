import { useEffect, useState } from "react";
import { api } from "../api";
import { Spinner } from "../ui";
import type { GrowerInventoryRow } from "../types";

/** Read-only insight into the inventory of the growers in an operator's program — the grower
 * keeps sole ownership of and write access to their own inventory (see
 * grower/GrainInventory.tsx); this just surfaces it here. See
 * enrollments_routes.py's /api/enrollments/growers-inventory. */
export default function GrowersInventoryRollup() {
  const [rows, setRows] = useState<GrowerInventoryRow[] | null>(null);

  useEffect(() => {
    api.growersInventoryRollup().then((r) => setRows(r.growers_inventory)).catch(() => setRows([]));
  }, []);

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-slate-900">Enrolled Growers' Inventory</h2>
      <p className="mt-0.5 text-sm text-slate-600">
        Read-only — each grower manages their own inventory balance.
      </p>

      <div className="mt-4">
        {!rows ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">No enrolled growers have set up inventory yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4">Grower</th>
                  <th className="pb-2 pr-4">Commodity</th>
                  <th className="pb-2 pr-4">Marketing Year</th>
                  <th className="pb-2 pr-4">Basis</th>
                  <th className="pb-2 pr-4">Total</th>
                  <th className="pb-2 pr-4">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-brand-edge">
                    <td className="py-2 pr-4 font-medium text-slate-800">{r.grower_name || "—"}</td>
                    <td className="py-2 pr-4 text-slate-600">{r.commodity}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Spinner } from "../ui";
import type { AdminListing } from "../types";

export default function ListingsTable() {
  const [listings, setListings] = useState<AdminListing[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => api.adminListings().then((r) => setListings(r.listings)).catch(() => setListings([]));
  useEffect(() => { load(); }, []);

  const remove = async (l: AdminListing) => {
    if (!confirm(`Remove this ${l.listing_type}? This can't be undone.`)) return;
    setBusyId(l.id);
    try {
      await api.adminRemoveListing(l.listing_type, l.id);
      setListings((ls) => ls && ls.filter((x) => x.id !== l.id));
    } finally {
      setBusyId(null);
    }
  };

  if (!listings) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-2 pr-4">Type</th>
            <th className="pb-2 pr-4">Commodity</th>
            <th className="pb-2 pr-4">Created By</th>
            <th className="pb-2 pr-4">Quantity</th>
            <th className="pb-2 pr-4">Status</th>
            <th className="pb-2 pr-4">Created</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => (
            <tr key={`${l.listing_type}-${l.id}`} className="border-t border-brand-edge">
              <td className="py-2 pr-4"><Badge tone={l.listing_type === "offer" ? "green" : "blue"}>{l.listing_type}</Badge></td>
              <td className="py-2 pr-4 text-slate-800">{l.commodity}{l.variety ? ` — ${l.variety}` : ""}</td>
              <td className="py-2 pr-4 text-slate-600">{l.created_by_name || "—"}</td>
              <td className="py-2 pr-4 text-slate-600">{l.quantity ?? "—"} {l.uom}</td>
              <td className="py-2 pr-4"><Badge tone="slate">{l.status}</Badge></td>
              <td className="py-2 pr-4 text-slate-500">{new Date(l.created_at).toLocaleDateString()}</td>
              <td className="py-2">
                <button
                  type="button"
                  className="text-xs font-medium text-slate-500 hover:text-red-600"
                  disabled={busyId === l.id}
                  onClick={() => remove(l)}
                >
                  {busyId === l.id ? "…" : "Remove"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

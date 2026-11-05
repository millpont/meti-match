import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Spinner, StatTile } from "../ui";
import type { AdminDashboard } from "../types";
import { formatCurrency, formatNumber } from "../format";

export default function DashboardOverview() {
  const [data, setData] = useState<AdminDashboard | null>(null);

  useEffect(() => { api.adminDashboard().then(setData).catch(() => setData(null)); }, []);

  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total Volume (MT)" value={data.stats.total_volume_mt.value} pctChange={data.stats.total_volume_mt.pct_change} />
        <StatTile label="GMV" value={data.stats.gmv_usd.value} pctChange={data.stats.gmv_usd.pct_change} prefix="$" />
        <StatTile label="Total Transactions" value={data.stats.total_transactions.value} pctChange={data.stats.total_transactions.pct_change} />
        <StatTile label="Active Buyers" value={data.stats.active_buyers.value} pctChange={data.stats.active_buyers.pct_change} />
        <StatTile label="Active Sellers" value={data.stats.active_sellers.value} pctChange={data.stats.active_sellers.pct_change} />
      </div>
      <p className="text-xs text-slate-400">Stats are for the last 30 days, compared against the prior 30-day window.</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Volume by State</h2>
          {data.volume_by_state.length === 0 ? (
            <p className="text-sm text-slate-500">No published offers yet.</p>
          ) : (
            <div className="space-y-2">
              {data.volume_by_state.slice(0, 10).map((s) => {
                const max = data.volume_by_state[0]?.volume || 1;
                return (
                  <div key={s.state} className="flex items-center gap-3 text-sm">
                    <span className="w-10 shrink-0 font-medium text-slate-700">{s.state}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-bg">
                      <div className="h-full rounded-full bg-brand-green" style={{ width: `${(s.volume / max) * 100}%` }} />
                    </div>
                    <span className="w-20 shrink-0 text-right text-slate-500">{formatNumber(s.volume)} MT</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Recent Transactions</h2>
          {data.recent_transactions.length === 0 ? (
            <p className="text-sm text-slate-500">No agreements yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-3">Commodity</th>
                    <th className="pb-2 pr-3">Seller</th>
                    <th className="pb-2 pr-3">Buyer</th>
                    <th className="pb-2 pr-3">Value</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_transactions.map((t) => (
                    <tr key={t.id} className="border-t border-brand-edge">
                      <td className="py-1.5 pr-3 text-slate-800">{t.commodity}{t.variety ? ` — ${t.variety}` : ""}</td>
                      <td className="py-1.5 pr-3 text-slate-600">{t.seller_name || "—"}</td>
                      <td className="py-1.5 pr-3 text-slate-600">{t.buyer_name || "—"}</td>
                      <td className="py-1.5 pr-3 text-slate-600">
                        {t.final_volume != null && t.final_price_usd_per_mt != null
                          ? formatCurrency(Math.round(t.final_volume * t.final_price_usd_per_mt))
                          : "—"}
                      </td>
                      <td className="py-1.5"><Badge tone={t.status === "completed" ? "green" : t.status === "shipped" ? "blue" : "amber"}>{t.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

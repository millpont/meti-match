import { useEffect, useState } from "react";
import { api } from "../api";
import { StatTile } from "../ui";
import type { MyStats } from "../types";

/** Every non-admin role's own-activity summary — same shape as the admin dashboard's
 * marketplace-wide stats, scoped to the caller's own contracts (api.myStats). For a program
 * operator this is a rollup that also includes their active enrolled growers' contracts (see
 * contracts_routes.py's my_stats) — `note` lets the caller say so.
 *
 * `listingsByUom` (volume summed across the caller's own currently-published listings, grouped by
 * unit-of-measure since bushels/MT aren't freely convertible without a commodity-specific factor)
 * renders as a separate "From Listings" row above the contract-derived "From Contracts" row below
 * — contracts only ever reflect accepted/completed deals, so this is the only view into what's
 * currently offered/bid but not yet under contract. */
export default function MyStatsRow({ note, listingsByUom }: { note?: string; listingsByUom?: Record<string, number> }) {
  const [stats, setStats] = useState<MyStats | null>(null);

  useEffect(() => { api.myStats().then((r) => setStats(r.stats)).catch(() => setStats(null)); }, []);

  if (!stats) return null;

  const listingsEntries = Object.entries(listingsByUom || {});

  return (
    <div>
      {listingsEntries.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">From Listings</div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {listingsEntries.map(([uom, volume]) => (
              <StatTile key={uom} label={`Published Volume (${uom})`} value={volume} pctChange={null} />
            ))}
          </div>
        </div>
      )}
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">From Contracts</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total Volume (MT)" value={stats.total_volume_mt.value} pctChange={stats.total_volume_mt.pct_change} />
        <StatTile label="GMV" value={stats.gmv_usd.value} pctChange={stats.gmv_usd.pct_change} prefix="$" />
        <StatTile label="Transactions" value={stats.total_transactions.value} pctChange={stats.total_transactions.pct_change} />
        <StatTile label="Active Counterparties" value={stats.active_counterparties.value} pctChange={stats.active_counterparties.pct_change} />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {note ?? "Your own activity, last 30 days vs. the prior 30-day window."}
      </p>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Deal } from "../types";
import { COMMODITY_GROUPS, US_STATES, YEARS } from "../constants";
import { ChipMultiSelect, EmptyState, Spinner } from "../ui";
import DealCard from "./DealCard";
import DealModal from "./DealModal";

export default function Boards() {
  const [bids, setBids] = useState<Deal[]>([]);
  const [offers, setOffers] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [commodityFilter, setCommodityFilter] = useState<string[]>([]);
  const [yearFilter, setYearFilter] = useState<string[]>([]);
  const [open, setOpen] = useState<Deal | null>(null);
  const [busy, setBusy] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const allCommodities = COMMODITY_GROUPS.flatMap((g) => g.items);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, o] = await Promise.all([
        api.boards("buyer", stateFilter, commodityFilter, yearFilter),
        api.boards("seller", stateFilter, commodityFilter, yearFilter),
      ]);
      setBids(b.deals);
      setOffers(o.deals);
    } finally {
      setLoading(false);
    }
  }, [stateFilter, commodityFilter, yearFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function expressInterest(deal: Deal) {
    setBusy(true);
    try {
      await api.expressInterest(deal.id);
      setOpen(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Boards</h2>
          <p className="text-sm text-slate-500">Buyer demand and seller supply.</p>
        </div>
        <button className="btn-ghost text-xs" onClick={() => setShowFilters((s) => !s)}>
          {showFilters ? "Hide filters" : "Filters"}
        </button>
      </div>

      {showFilters && (
        <div className="card space-y-4 p-4">
          <div>
            <span className="label">States</span>
            <ChipMultiSelect options={US_STATES} selected={stateFilter} onChange={setStateFilter} />
          </div>
          <div>
            <span className="label">Commodities</span>
            <ChipMultiSelect options={allCommodities} selected={commodityFilter} onChange={setCommodityFilter} />
          </div>
          <div>
            <span className="label">Years</span>
            <ChipMultiSelect options={YEARS} selected={yearFilter} onChange={setYearFilter} />
          </div>
          {(stateFilter.length > 0 || commodityFilter.length > 0 || yearFilter.length > 0) && (
            <button
              className="btn-ghost text-xs"
              onClick={() => { setStateFilter([]); setCommodityFilter([]); setYearFilter([]); }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <BoardColumn title="Bid Board" subtitle="Demand" count={bids.length}>
            {bids.length === 0 ? (
              <EmptyState title="No buyer demand yet" />
            ) : (
              bids.map((d) => <DealCard key={d.id} deal={d} onOpen={() => setOpen(d)} />)
            )}
          </BoardColumn>
          <BoardColumn title="Offer Board" subtitle="Supply" count={offers.length}>
            {offers.length === 0 ? (
              <EmptyState title="No seller supply yet" />
            ) : (
              offers.map((d) => <DealCard key={d.id} deal={d} onOpen={() => setOpen(d)} />)
            )}
          </BoardColumn>
        </div>
      )}

      {open && (
        <DealModal
          deal={open}
          onClose={() => setOpen(null)}
          onExpressInterest={() => expressInterest(open)}
          busy={busy}
        />
      )}
    </div>
  );
}

function BoardColumn({
  title, subtitle, count, children,
}: { title: string; subtitle: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="font-semibold text-white">{title}</h3>
        <span className="text-xs uppercase tracking-wide text-slate-500">{subtitle}</span>
        <span className="ml-auto chip bg-slate-700/50 text-slate-300">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

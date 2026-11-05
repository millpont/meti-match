import type { Deal } from "../types";
import { OUTCOMES } from "../constants";
import { taxLabel } from "../taxonomy";
import { Badge } from "../ui";

export function assetTypes(deal: Deal): string[] {
  const assets = new Set<string>();
  for (const o of OUTCOMES) {
    if (deal[o.field] != null) assets.add(o.asset);
  }
  return [...assets];
}

export function outcomeSummary(deal: Deal): { label: string; value: number; unit: string }[] {
  return OUTCOMES.filter((o) => deal[o.field] != null).map((o) => ({
    label: o.label,
    value: deal[o.field] as number,
    unit: o.unit,
  }));
}

export default function DealCard({
  deal,
  onOpen,
  actionLabel,
  onAction,
  disabled,
}: {
  deal: Deal;
  onOpen?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="card p-4 transition-colors hover:border-slate-600">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Badge tone={deal.account_type === "buyer" ? "blue" : "green"}>
          {deal.account_type === "buyer" ? "Buyer" : "Seller"}
        </Badge>
        {deal.is_own && <Badge tone="violet">Your listing</Badge>}
        {assetTypes(deal).map((a) => (
          <Badge key={a} tone={a === "Carbon" ? "green" : a === "Water" ? "blue" : "amber"}>{a}</Badge>
        ))}
        {!deal.is_own && deal.user_expressed_interest && <Badge tone="violet">Interest expressed</Badge>}
        <span className="ml-auto text-xs text-slate-500">
          {deal.match_count > 0 ? `${deal.match_count} interested` : "No interest yet"}
        </span>
      </div>

      <div className="space-y-1 text-sm">
        <div className="font-medium text-slate-200">{deal.commodity.join(", ") || "—"}</div>
        <div className="text-slate-400">
          {deal.state.join(", ")} · {deal.year.join(", ")}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {outcomeSummary(deal).slice(0, 3).map((o) => (
          <span key={o.label} className="chip bg-slate-700/40 text-slate-300">
            {o.label}: {o.value.toLocaleString()} {o.unit}
          </span>
        ))}
      </div>

      {(deal.carbon_pools.length > 0 || deal.emission_sources.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {[...deal.carbon_pools, ...deal.emission_sources].slice(0, 3).map((c) => (
            <span key={c} className="chip bg-slate-800 text-slate-400 text-[11px]">{taxLabel(c)}</span>
          ))}
          {deal.carbon_pools.length + deal.emission_sources.length > 3 && (
            <span className="chip bg-slate-800 text-slate-500 text-[11px]">
              +{deal.carbon_pools.length + deal.emission_sources.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        {onOpen && (
          <button className="btn-ghost text-xs" onClick={onOpen}>View details</button>
        )}
        {actionLabel && (
          <button className="btn-primary text-xs" onClick={onAction} disabled={disabled}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

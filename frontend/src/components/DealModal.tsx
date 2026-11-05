import type { Deal } from "../types";
import { Badge } from "../ui";
import { taxLabel } from "../taxonomy";
import { assetTypes, outcomeSummary } from "./DealCard";

export default function DealModal({
  deal,
  onClose,
  onExpressInterest,
  busy,
}: {
  deal: Deal;
  onClose: () => void;
  onExpressInterest?: () => void;
  busy?: boolean;
}) {
  const canExpress = !deal.is_own && !deal.user_expressed_interest && onExpressInterest;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="card max-h-[85vh] w-full max-w-lg overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={deal.account_type === "buyer" ? "blue" : "green"}>
              {deal.account_type === "buyer" ? "Buyer (Demand)" : "Seller (Supply)"}
            </Badge>
            {deal.is_own && <Badge tone="violet">Your listing</Badge>}
            {assetTypes(deal).map((a) => (
              <Badge key={a} tone={a === "Carbon" ? "green" : a === "Water" ? "blue" : "amber"}>{a}</Badge>
            ))}
          </div>
          <button className="text-slate-500 hover:text-slate-300" onClick={onClose}>✕</button>
        </div>

        <dl className="space-y-3 text-sm">
          <Row label="Commodities" value={deal.commodity.join(", ") || "—"} />
          <Row label="Location" value={`${deal.state.join(", ")}${deal.region.length ? ` (${deal.region.join(", ")})` : ""}`} />
          <Row label="Years" value={deal.year.join(", ")} />
          <div>
            <dt className="label">Outcomes</dt>
            <dd className="space-y-1.5">
              {outcomeSummary(deal).map((o) => {
                const price = deal.outcome_pricing?.[
                  (deal.outcome_pricing && Object.keys(deal.outcome_pricing).find((k) => k)) as never
                ];
                void price;
                return (
                  <div key={o.label} className="flex items-center justify-between rounded-lg border border-brand-edge px-3 py-2">
                    <span className="text-slate-300">{o.label}</span>
                    <span className="font-medium text-white">{o.value.toLocaleString()} {o.unit}</span>
                  </div>
                );
              })}
            </dd>
          </div>
          {deal.outcome_pricing && Object.keys(deal.outcome_pricing).length > 0 && (
            <div>
              <dt className="label">Price ranges (USD / unit)</dt>
              <dd className="space-y-1">
                {Object.entries(deal.outcome_pricing).map(([field, p]) => (
                  <div key={field} className="flex justify-between text-slate-400">
                    <span>{field}</span>
                    <span>${p?.floor ?? "—"} – ${p?.ceiling ?? "—"}</span>
                  </div>
                ))}
              </dd>
            </div>
          )}
          {deal.practices?.selected?.length ? (
            <Row label="Practices" value={deal.practices.selected.join(", ")} />
          ) : null}

          {(deal.carbon_pools.length || deal.emission_sources.length || deal.credit_character.length ||
            deal.stratum || (deal.additionality && deal.additionality !== "NOT_APPLICABLE")) ? (
            <div className="border-t border-brand-edge pt-3">
              <dt className="label">Activity &amp; methodology</dt>
              <dd className="space-y-2">
                {deal.carbon_pools.length > 0 && (
                  <TaxRow label="Carbon pools" codes={deal.carbon_pools} tone="green" />
                )}
                {deal.emission_sources.length > 0 && (
                  <TaxRow label="Emission sources" codes={deal.emission_sources} tone="amber" />
                )}
                {deal.credit_character.length > 0 && (
                  <TaxRow label="Credit character" codes={deal.credit_character} tone="blue" />
                )}
                {deal.stratum && <Row label="Stratum" value={taxLabel(deal.stratum)} />}
                {deal.additionality && deal.additionality !== "NOT_APPLICABLE" && (
                  <Row label="Additionality" value={taxLabel(deal.additionality)} />
                )}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-ghost" onClick={onClose}>Close</button>
          {canExpress ? (
            <button className="btn-primary" onClick={onExpressInterest} disabled={busy}>
              {busy ? "…" : "Express interest"}
            </button>
          ) : deal.is_own ? (
            <span className="self-center text-xs text-slate-500">
              This is your listing — interested parties will appear in your Matches tab for you to approve.
            </span>
          ) : deal.user_expressed_interest ? (
            <span className="self-center text-xs text-violet-400">Interest already expressed</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TaxRow({ label, codes, tone }: { label: string; codes: string[]; tone: "green" | "amber" | "blue" }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {codes.map((c) => <Badge key={c} tone={tone}>{taxLabel(c)}</Badge>)}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="label mb-0">{label}</dt>
      <dd className="text-right font-medium text-slate-200">{value}</dd>
    </div>
  );
}

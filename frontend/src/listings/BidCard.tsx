import { useState } from "react";
import { Badge, isRecent, NewBadge } from "../ui";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import { fromAcres } from "../units";
import type { Bid } from "../types";
import { BID_TYPE_LABELS } from "./constants";
import { commodityImage } from "./commodityImages";
import { ASSET_CLASS_LABELS, assetClassOf, bidUnit, isOutcomeListing } from "./environmental";
import OutcomeDetails, { hasOutcomeDetails } from "./OutcomeDetails";
import { formatCurrency, formatNumber } from "../format";
import ProfileLink from "../profile/ProfileLink";
import RespondedNote from "./RespondedNote";
import { useVerification } from "../profile/VerificationPrompt";

export default function BidCard({
  bid, responded, responding, onRespond, preview,
}: {
  bid: Bid;
  responded: boolean;
  responding: boolean;
  onRespond: () => void;
  /** Render as the pre-publish review of an unsaved draft: no respond button, details expanded
   * so everything picked is visible at once. */
  preview?: boolean;
}) {
  const img = commodityImage(bid.commodity);
  // quantity/remaining_quantity are always stored normalized to acres (same convention as
  // offers.acres_offered) — convert back to whatever unit the buyer originally posted in for
  // display, same round-trip units.ts's fromAcres exists for.
  const isAcresBid = bid.bid_type === "acres_for_contracting";
  const isOutcome = isOutcomeListing(bid);
  const qtyUnit = bidUnit(bid);
  // Grain bids are priced per MT (acres bids too); outcome bids per their own unit.
  const priceUnit = isOutcome ? qtyUnit : "MT";
  const displayQuantity = isAcresBid && bid.quantity != null ? fromAcres(bid.quantity, bid.area_unit || "acres") : bid.quantity;
  const displayRemaining = isAcresBid && bid.remaining_quantity != null ? fromAcres(bid.remaining_quantity, bid.area_unit || "acres") : bid.remaining_quantity;
  const attributes = useTaxonomyTerms("attribute");
  const practices = useTaxonomyTerms("practice");
  const certifications = useTaxonomyTerms("certification");
  const dataRequirements = useTaxonomyTerms("data_requirement");
  const hasDetails = bid.required_attributes.length > 0 || bid.required_practices.length > 0 ||
    bid.required_certifications.length > 0 || bid.required_data_requirements.length > 0 || hasOutcomeDetails(bid);
  // Collapsed by default so every card starts at the same height regardless of how many
  // requirements a given bid has — previously this block rendered unconditionally inline,
  // making bids with lots of requirements visibly taller than ones without.
  const [expanded, setExpanded] = useState(!!preview);
  const { requireVerified } = useVerification();

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-brand-bg">
          {img && <img src={img} alt={bid.commodity} className="h-full w-full object-cover" />}
        </div>

        <div className="min-w-[160px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">
              {bid.commodity}{bid.variety ? ` — ${bid.variety}` : ""}
            </span>
            {isRecent(bid.created_at) && <NewBadge />}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {isOutcome
              ? <Badge tone="green">{ASSET_CLASS_LABELS[assetClassOf(bid)]}</Badge>
              : <Badge tone="blue">{BID_TYPE_LABELS[bid.bid_type] ?? bid.bid_type}</Badge>}
            {isOutcome && (bid.vintage_years ?? []).length > 0 && <Badge tone="slate">Vintage {bid.vintage_years!.join(", ")}</Badge>}
            {bid.destination_country && <Badge tone="slate">{bid.destination_country}</Badge>}
            {!bid.allow_partial && <Badge tone="amber">Full amount only</Badge>}
            {bid.has_active_negotiation && <Badge tone="amber">In Negotiation</Badge>}
          </div>
          {!preview && <div className="mt-2">
            <ProfileLink accountId={bid.created_by} name={bid.created_by_name} />
          </div>}
        </div>

        <div className="min-w-[110px]">
          <div className="text-xs text-slate-500">Quantity</div>
          <div className="text-lg font-bold text-brand-green">
            {displayQuantity != null ? formatNumber(displayQuantity, isAcresBid ? 1 : 2) : "—"} {qtyUnit}
          </div>
          {displayRemaining != null && bid.remaining_quantity !== bid.quantity && (
            <div className="text-xs text-amber-700">{formatNumber(displayRemaining, 1)} {qtyUnit} remaining</div>
          )}
        </div>

        <div className="min-w-[100px] text-xs">
          <div className="text-slate-500">Bid Price</div>
          <div className="text-sm text-slate-800">{bid.bid_price_usd_per_mt != null ? `${formatCurrency(bid.bid_price_usd_per_mt)}/${priceUnit}` : "—"}</div>
        </div>

        <div className="min-w-[150px] text-xs">
          <div className="text-slate-500">Delivery Window</div>
          <div className="mt-0.5 text-slate-700">
            {bid.delivery_window_start && bid.delivery_window_end
              ? `${bid.delivery_window_start} – ${bid.delivery_window_end}`
              : "—"}
          </div>
          <div className="mt-2 text-slate-500">Posted</div>
          <div className="mt-0.5 text-slate-700">{new Date(bid.created_at).toLocaleDateString()}</div>
        </div>

        {!preview && <div className="flex items-center self-center">
          <button
            type="button"
            className="btn shrink-0 bg-brand-gold text-white hover:brightness-95"
            disabled={responded || responding}
            onClick={() => { if (requireVerified("respond to a bid")) onRespond(); }}
          >
            {responded ? "Response Sent ✓" : responding ? "Sending…" : "Respond to Bid"}
          </button>
        </div>}
      </div>

      {responded && !preview && <RespondedNote verb="response" />}

      {hasDetails && (
        <div className="mt-3 border-t border-brand-edge pt-3">
          <button
            type="button"
            className="text-xs font-medium text-brand-green hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide Details" : "View All Details"}
          </button>
        </div>
      )}

      {hasDetails && expanded && (
        <div className="mt-3 space-y-1.5 text-sm text-slate-600">
          <OutcomeDetails listing={bid} />
          {bid.required_attributes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-slate-700">Required Attributes:</span>
              {bid.required_attributes.map((a) => (
                <Badge key={a} tone="green" title={bid.required_attribute_notes?.[a] || attributes.titles[a]}>{a}</Badge>
              ))}
            </div>
          )}
          {bid.required_practices.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-slate-700">Practices:</span>
              {bid.required_practices.map((p) => <Badge key={p} tone="blue" title={practices.titles[p]}>{p}</Badge>)}
            </div>
          )}
          {bid.required_certifications.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-slate-700">Certifications:</span>
              {bid.required_certifications.map((c) => <Badge key={c} tone="violet" title={certifications.titles[c]}>{c}</Badge>)}
            </div>
          )}
          {bid.required_data_requirements.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-slate-700">Data Requirements:</span>
              {bid.required_data_requirements.map((d) => <Badge key={d} tone="slate" title={dataRequirements.titles[d]}>{d}</Badge>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

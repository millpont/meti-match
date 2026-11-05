import { useState } from "react";
import { Badge, isRecent, NewBadge, PinIcon } from "../ui";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import { commodityImage } from "./commodityImages";
import { formatCurrency, formatNumber } from "../format";
import ProfileLink from "../profile/ProfileLink";
import RespondedNote from "./RespondedNote";
import { useVerification } from "../profile/VerificationPrompt";
import { ASSET_CLASS_LABELS, assetClassOf } from "./environmental";
import OutcomeDetails from "./OutcomeDetails";
import type { OfferCardProps } from "./SupplyOfferCard";

/** Marketplace card for a carbon / environmental-data offer — same actions as a grain offer card,
 * but shows vintage, price per outcome unit, standards and practices instead of grain specs. */
export default function OutcomeOfferCard({ offer, responded, responding, onRespond, preview }: OfferCardProps) {
  const img = commodityImage(offer.commodity);
  const certifications = useTaxonomyTerms("certification");
  const practices = useTaxonomyTerms("practice");
  const offerPractices = offer.production?.conservation_practices ?? [];
  const dataAttributes = offer.data_attributes ?? [];
  const [expanded, setExpanded] = useState(!!preview);
  const { requireVerified } = useVerification();
  const vintages = offer.vintage_years ?? [];
  const states = offer.source_states ?? [];

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-brand-bg">
          {img && <img src={img} alt="" className="h-full w-full object-cover" />}
        </div>

        <div className="min-w-[170px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{offer.commodity}</span>
            {isRecent(offer.created_at) && <NewBadge />}
            <Badge tone="green">{ASSET_CLASS_LABELS[assetClassOf(offer)]}</Badge>
            {offer.has_active_negotiation && <Badge tone="amber">In Negotiation</Badge>}
          </div>
          {states.length > 0 && (
            <div className="mt-1 flex items-center gap-1 text-sm text-slate-500">
              <PinIcon />
              {states.join(" · ")}, United States
            </div>
          )}
          <div className="mt-3 flex gap-6 text-xs">
            <div>
              <div className="text-slate-500">Vintage</div>
              <div className="mt-0.5 text-slate-700">{vintages.length > 0 ? vintages.join(", ") : "—"}</div>
            </div>
            <div>
              <div className="text-slate-500">Delivery Window</div>
              <div className="mt-0.5 text-slate-700">
                {offer.delivery_window_start && offer.delivery_window_end ? `${offer.delivery_window_start} – ${offer.delivery_window_end}` : "—"}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Posted</div>
              <div className="mt-0.5 text-slate-700">{new Date(offer.created_at).toLocaleDateString()}</div>
            </div>
          </div>
          {!preview && <div className="mt-2">
            <ProfileLink accountId={offer.created_by} name={offer.created_by_name} />
          </div>}
        </div>

        <div className="min-w-[110px]">
          <div className="text-xs text-slate-500">Quantity</div>
          <div className="text-lg font-bold text-brand-green">{formatNumber(offer.expected_volume)} {offer.uom}</div>
          {offer.remaining_volume != null && offer.remaining_volume !== offer.expected_volume && (
            <div className="text-xs text-amber-700">{formatNumber(offer.remaining_volume, 1)} {offer.uom} remaining</div>
          )}
          {offer.min_order != null && (
            <div className="mt-1 text-xs text-slate-500">Minimum: {formatNumber(offer.min_order)} {offer.uom}</div>
          )}
        </div>

        <div className="min-w-[90px] text-xs">
          <div className="text-slate-500">Asking Price</div>
          <div className="text-sm text-slate-800">
            {offer.desired_price != null ? `${formatCurrency(offer.desired_price)}/${offer.uom}` : "Open to offers"}
          </div>
        </div>

        <div className="min-w-[150px]">
          <div className="text-xs text-slate-500">Standards / Certifications</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {offer.certifications.length > 0
              ? offer.certifications.map((c) => <Badge key={c} tone="green" title={certifications.titles[c]}>{c}</Badge>)
              : <span className="text-sm text-slate-400">—</span>}
          </div>
        </div>

        {!preview && <div className="flex items-center self-center">
          <button
            type="button"
            className="btn shrink-0 bg-brand-gold text-white hover:brightness-95"
            disabled={responded || responding}
            onClick={() => { if (requireVerified("contact a supplier")) onRespond(); }}
          >
            {responded ? "Contact Requested ✓" : responding ? "Sending…" : "Contact Supplier"}
          </button>
        </div>}
      </div>

      {responded && !preview && <RespondedNote verb="contact" />}

      <div className="mt-3 border-t border-brand-edge pt-3">
        <button type="button" className="text-xs font-medium text-brand-green hover:underline" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide Details" : "View All Details"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-1.5 text-sm text-slate-600">
          <OutcomeDetails listing={offer} dataAttributes={dataAttributes} />
          {offerPractices.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-slate-700">Practices:</span>
              {offerPractices.map((p) => <Badge key={p} tone="blue" title={practices.titles[p]}>{p}</Badge>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

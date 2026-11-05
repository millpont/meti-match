import { useState } from "react";
import { Badge, isRecent, NewBadge, PinIcon, withoutNone } from "../ui";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import type { Offer } from "../types";
import { acresPlaceholderImage, commodityImage } from "./commodityImages";
import { formatNumber, rotationLabel } from "../format";
import ProfileLink from "../profile/ProfileLink";
import RespondedNote from "./RespondedNote";
import { useVerification } from "../profile/VerificationPrompt";
import { isOutcomeListing } from "./environmental";
import OutcomeOfferCard from "./OutcomeOfferCard";

export interface OfferCardProps {
  offer: Offer;
  responded: boolean;
  responding: boolean;
  onRespond: () => void;
  /** Render as the pre-publish review of an unsaved draft: no respond button, details expanded
   * so everything picked is visible at once. */
  preview?: boolean;
}

/** Carbon / environmental-data offers have no grain spec or production data to show, so they get
 * their own card layout (OutcomeOfferCard). */
export default function SupplyOfferCard(props: OfferCardProps) {
  return isOutcomeListing(props.offer) ? <OutcomeOfferCard {...props} /> : <GrainOfferCard {...props} />;
}

function GrainOfferCard({ offer, responded, responding, onRespond, preview }: OfferCardProps) {
  const img = offer.quantity_basis === "acres" ? acresPlaceholderImage() : commodityImage(offer.commodity);
  const title = offer.variety || offer.commodity;
  const p = offer.production;
  const attributes = useTaxonomyTerms("attribute");
  const practices = useTaxonomyTerms("practice");
  const certifications = useTaxonomyTerms("certification");
  const hasProduction = p.has_default || p.has_override;
  const hasGrainSpec = offer.test_weight != null || offer.bcfm_pct != null || !!offer.seed_variety
    || offer.tannin_level_max != null || offer.non_tannin_sorghum || offer.bnfm_pct != null;
  const hasDetails =
    offer.sustainability_attributes.length > 0 ||
    offer.specialty_attributes.length > 0 ||
    hasProduction || hasGrainSpec;
  // Collapsed by default so every card starts at the same height regardless of how much detail a
  // given listing has — previously the details block (when present) rendered unconditionally,
  // making cards with lots of attributes/production data visibly taller than ones without.
  const [expanded, setExpanded] = useState(!!preview);
  // Defaulted: not every endpoint that returns offers (e.g. matching) attaches this.
  const aggregateGrowers = offer.aggregate_growers ?? [];
  const { requireVerified } = useVerification();

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-brand-bg">
          {img && <img src={img} alt={offer.commodity} className="h-full w-full object-cover" />}
        </div>

        <div className="min-w-[170px] flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">{title}</span>
            {isRecent(offer.created_at) && <NewBadge />}
            {offer.listing_timing === "future" && <Badge tone="blue">Future</Badge>}
            {offer.quantity_basis === "acres" && <Badge tone="slate">Acres-basis</Badge>}
            {offer.has_active_negotiation && <Badge tone="amber">In Negotiation</Badge>}
          </div>
          {offer.locations.length > 0 && (
            <div className="mt-1 flex items-center gap-1 text-sm text-slate-500">
              <PinIcon />
              {offer.locations.map((l) => l.counties.length > 0 ? `${l.counties.join("/")}, ${l.state}` : l.state).join(" · ")}, United States
            </div>
          )}
          <div className="mt-3 flex gap-6 text-xs">
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
          <div className="text-xs text-slate-500">Volume</div>
          <div className="text-lg font-bold text-brand-green">{formatNumber(offer.expected_volume)} {offer.uom}</div>
          {aggregateGrowers.length > 0 && (
            <div className="text-xs text-slate-500" title={aggregateGrowers.map((g) => `${g.grower_name ?? "Grower"}: ${formatNumber(g.contributed_volume)} ${offer.uom}`).join("\n")}>
              Aggregated from {aggregateGrowers.length} enrolled grower{aggregateGrowers.length === 1 ? "" : "s"}
            </div>
          )}
          {offer.remaining_volume != null && offer.remaining_volume !== offer.expected_volume && (
            <div className="text-xs text-amber-700">{formatNumber(offer.remaining_volume, 1)} {offer.uom} remaining</div>
          )}
          {offer.min_order != null && (
            <div className="mt-1 text-xs text-slate-500">Minimum Delivery Volume: {formatNumber(offer.min_order)} {offer.uom}</div>
          )}
        </div>

        <div className="min-w-[90px] text-xs">
          <div className="text-slate-500">Protein</div>
          <div className="text-sm text-slate-800">{offer.protein_pct != null ? `${offer.protein_pct}%` : "—"}</div>
          <div className="mt-2 text-slate-500">Moisture</div>
          <div className="text-sm text-slate-800">{offer.moisture_pct_max != null ? `${offer.moisture_pct_max}% Max` : "—"}</div>
        </div>

        <div className="min-w-[150px]">
          <div className="text-xs text-slate-500">Certifications</div>
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
        <div className="mt-3 space-y-1 text-sm text-slate-600">
          {hasGrainSpec && (
            <div>
              <span className="font-medium text-slate-700">Grain Spec: </span>
              {[
                offer.test_weight != null && `Test Weight ${formatNumber(offer.test_weight)}`,
                offer.bcfm_pct != null && `BCFM ${offer.bcfm_pct}%`,
                offer.seed_variety && `Seed Variety: ${offer.seed_variety}`,
                offer.tannin_level_max != null && `Tannin Max ${offer.tannin_level_max}`,
                offer.non_tannin_sorghum && "Non-Tannin/White Sorghum",
                offer.bnfm_pct != null && `BNFM ${offer.bnfm_pct}%`,
              ].filter(Boolean).join(" · ")}
            </div>
          )}
          {offer.sustainability_attributes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-slate-700">Sustainability:</span>
              {withoutNone(offer.sustainability_attributes).map((a) => <Badge key={a} tone="green" title={attributes.titles[a]}>{a}</Badge>)}
            </div>
          )}
          {offer.specialty_attributes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-slate-700">Specialty:</span>
              {withoutNone(offer.specialty_attributes).map((a) => <Badge key={a} tone="violet" title={attributes.titles[a]}>{a}</Badge>)}
            </div>
          )}
          {hasProduction && (
            <div>
              <span className="font-medium text-slate-700">Baseline production data{p.has_override ? " (this listing only)" : ` (${offer.commodity} default)`}: </span>
              {[
                p.actual_yield_per_acre != null && `${formatNumber(p.actual_yield_per_acre)} ${p.yield_unit || "yield/acre"}`,
                p.irrigation_type && p.irrigation_type,
                rotationLabel(p.crop_rotation_crops, p.crop_rotation_years),
                p.soil_test_on_file && "soil test on file",
                p.third_party_verified && "third-party verified",
              ].filter(Boolean).join(" · ") || "—"}
              {p.input_usage_notes && <div className="mt-0.5 text-slate-500">{p.input_usage_notes}</div>}
              {p.conservation_practices.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {p.conservation_practices.map((a) => <Badge key={a} tone="blue" title={practices.titles[a]}>{a}</Badge>)}
                </div>
              )}
              <div className="mt-1 flex flex-wrap gap-3">
                {p.has_soil_test_document && p.soil_test_document_url && (
                  <a
                    href={p.soil_test_document_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-brand-green hover:underline"
                  >
                    View soil test document
                  </a>
                )}
                {p.has_verification_document && p.verification_document_url && (
                  <a
                    href={p.verification_document_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-brand-green hover:underline"
                  >
                    View third-party verification statement
                  </a>
                )}
              </div>
              {!p.show_advanced_in_listing && !preview && (
                <p className="mt-2 text-xs text-slate-500">
                  Advanced production criteria (USDA FD-CIC inputs) aren't shared publicly for this listing —
                  contact the supplier and ask for them in your conversation.
                </p>
              )}
              {p.show_advanced_in_listing && (
                <div className="mt-2">
                  <span className="font-medium text-slate-700">Advanced Production Criteria: </span>
                  {[
                    p.nitrogen_lbs_per_acre != null && `Nitrogen ${formatNumber(p.nitrogen_lbs_per_acre)} lbs/acre`,
                    p.synthetic_phosphorus_lbs_per_acre != null && `Phosphorus ${formatNumber(p.synthetic_phosphorus_lbs_per_acre)} lbs/acre`,
                    p.synthetic_potassium_lbs_per_acre != null && `Potassium ${formatNumber(p.synthetic_potassium_lbs_per_acre)} lbs/acre`,
                    p.manure_type && `Manure: ${p.manure_type}`,
                    p.tdisc_score != null && `TDISC ${p.tdisc_score}`,
                  ].filter(Boolean).join(" · ") || "—"}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

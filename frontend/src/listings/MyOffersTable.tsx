import { Fragment, useEffect, useState } from "react";
import { api } from "../api";
import { Badge, ConfirmDialog, isStale } from "../ui";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import { formatCurrency, formatNumber } from "../format";
import type { ListingResponse, Offer, OfferStatus, ResponseStatus } from "../types";
import { commodityImage } from "./commodityImages";
import MatchResults from "./MatchResults";
import OfferDocumentsPanel from "./OfferDocumentsPanel";
import OfferEditForm from "./OfferEditForm";
import DraftBadge from "./DraftBadge";
import { useVerification } from "../profile/VerificationPrompt";

const STATUS_TONE: Record<OfferStatus, "slate" | "green" | "amber" | "red"> = {
  draft: "slate", published: "green", accepted: "green", withdrawn: "red",
};

const RESPONSE_STATUS_TONE: Record<ResponseStatus, "slate" | "green" | "amber" | "red" | "blue"> = {
  pending: "slate", "in-communication": "blue", "in-negotiation": "amber", accepted: "green", declined: "red",
};

export default function MyOffersTable({ offers: initialOffers, onChanged }: { offers: Offer[]; onChanged?: () => void }) {
  const [offers, setOffers] = useState(initialOffers);
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [docsId, setDocsId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [confirmWithdrawId, setConfirmWithdrawId] = useState<string | null>(null);
  const [responses, setResponses] = useState<ListingResponse[]>([]);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const { requireVerified } = useVerification();
  const attributes = useTaxonomyTerms("attribute");
  const practices = useTaxonomyTerms("practice");
  const certifications = useTaxonomyTerms("certification");

  useEffect(() => { setOffers(initialOffers); }, [initialOffers]);

  useEffect(() => {
    api.myResponses().then((r) => setResponses(r.to_my_listings.filter((x) => x.listing_type === "offer"))).catch(() => setResponses([]));
  }, [initialOffers]);

  const responsesFor = (offerId: string) => responses.filter((r) => r.listing_id === offerId);
  const hasAccepted = (offerId: string) => responsesFor(offerId).some((r) => r.status === "accepted");

  const refresh = async (id: string) => {
    setRefreshingId(id);
    try {
      await api.touchOffer(id);
      setOffers((os) => os.map((o) => (o.id === id ? { ...o, updated_at: new Date().toISOString() } : o)));
    } catch {
      // best-effort — leave the stale nudge up on failure
    } finally {
      setRefreshingId(null);
    }
  };

  // A draft goes live here — the first point business verification is enforced (saving a draft
  // never needs it). On-behalf drafts are excluded: those go live through the grower's approval.
  const publish = async (id: string) => {
    if (!requireVerified("publish a listing")) return;
    setPublishingId(id);
    setPublishError(null);
    try {
      const { offer } = await api.publishOffer(id);
      setOffers((os) => os.map((o) => (o.id === id ? offer : o)));
      onChanged?.();
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Couldn't publish");
    } finally {
      setPublishingId(null);
    }
  };

  const withdraw = async (id: string) => {
    setConfirmWithdrawId(null);
    setWithdrawingId(id);
    try {
      await api.withdrawOffer(id);
      setOffers((os) => os.map((o) => (o.id === id ? { ...o, status: "withdrawn" } : o)));
      onChanged?.();
    } catch {
      // best-effort
    } finally {
      setWithdrawingId(null);
    }
  };

  if (offers.length === 0) {
    return <p className="mt-4 text-sm text-slate-500">You haven&rsquo;t created any offers yet.</p>;
  }
  return (
    <div className="mt-4">
      {publishError && <p className="mb-2 text-sm text-red-600">{publishError}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2 pr-4" />
              <th className="pb-2 pr-4">Crop</th>
              <th className="pb-2 pr-4">Variety</th>
              <th className="pb-2 pr-4">For</th>
              <th className="pb-2 pr-4">Marketing Year</th>
              <th className="pb-2 pr-4">Type</th>
              <th className="pb-2 pr-4">Volume</th>
              <th className="pb-2 pr-4">Delivery</th>
              <th className="pb-2 pr-4">Price</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Updated</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => {
              const img = commodityImage(o.commodity);
              const p = o.production;
              const hasProduction = p.has_default || p.has_override;
              const offerResponses = responsesFor(o.id);
              return (
                <Fragment key={o.id}>
                  <tr className="cursor-pointer border-t border-brand-edge hover:bg-brand-bg/40" onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                    <td className="py-2 pr-4">
                      <div className="h-10 w-10 overflow-hidden rounded-md bg-brand-bg">
                        {img && <img src={img} alt={o.commodity} className="h-full w-full object-cover" />}
                      </div>
                    </td>
                    <td className="py-2 pr-4 font-medium text-slate-800">{o.commodity}</td>
                    <td className="py-2 pr-4 text-slate-600">{o.variety || "—"}</td>
                    <td className="py-2 pr-4 text-slate-600">
                      {o.on_behalf_of_grower_name
                        || ((o.aggregate_growers ?? []).length > 0 ? `Aggregated (${o.aggregate_growers.length} grower${o.aggregate_growers.length === 1 ? "" : "s"})` : "—")}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{o.marketing_year || "—"}</td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-col gap-1">
                        <Badge tone="slate">{o.quantity_basis === "acres" ? "Acres" : "Grain"}</Badge>
                        <Badge tone={o.listing_timing === "future" ? "blue" : "green"}>
                          {o.listing_timing === "future" ? "Future" : "Available"}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-slate-600">
                      {formatNumber(o.expected_volume)} {o.uom}
                      {o.quantity_basis === "acres" && o.acres_offered != null && (
                        <div className="text-xs text-slate-400">
                          {formatNumber(o.acres_offered)} {o.area_unit || "acres"} @ {formatNumber(o.yield_rate)} {o.yield_unit}
                        </div>
                      )}
                      {o.remaining_volume != null && o.remaining_volume !== o.expected_volume && (
                        <div className="text-xs text-amber-700">{formatNumber(o.remaining_volume, 1)} {o.uom} remaining</div>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">
                      {o.delivery_window_start && o.delivery_window_end ? `${o.delivery_window_start} – ${o.delivery_window_end}` : "—"}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">
                      {o.desired_price != null ? `${formatCurrency(o.desired_price)} (${o.price_type})` : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-1.5">
                        {o.grower_approval_status === "pending" ? (
                          <Badge tone="amber">Awaiting Grower Approval</Badge>
                        ) : o.grower_approval_status === "declined" ? (
                          <Badge tone="red">Declined by Grower</Badge>
                        ) : o.status === "draft" ? (
                          <DraftBadge audience="buyers" />
                        ) : (
                          <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>
                        )}
                        {o.status === "published" && isStale(o.updated_at) && <Badge tone="amber">Still valid?</Badge>}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{new Date(o.updated_at).toLocaleDateString()}</td>
                    <td className="py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="text-xs font-medium text-brand-green hover:underline"
                          onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                        >
                          {expandedId === o.id ? "Hide Details" : "View Details"}
                        </button>
                        {o.status === "published" && (
                          <button
                            type="button"
                            className="text-xs font-medium text-brand-green hover:underline"
                            onClick={() => setMatchingId(matchingId === o.id ? null : o.id)}
                          >
                            {matchingId === o.id ? "Hide" : "Find Matches"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-xs font-medium text-slate-500 hover:text-brand-green"
                          onClick={() => setDocsId(docsId === o.id ? null : o.id)}
                        >
                          {docsId === o.id ? "Hide Documents" : "Documents"}
                        </button>
                        {o.status === "published" && isStale(o.updated_at) && (
                          <button
                            type="button"
                            className="text-xs font-medium text-slate-500 hover:text-brand-green"
                            disabled={refreshingId === o.id}
                            onClick={() => refresh(o.id)}
                          >
                            {refreshingId === o.id ? "…" : "Refresh"}
                          </button>
                        )}
                        {o.status === "draft" && !o.on_behalf_of_grower_account_id && (
                          <button
                            type="button"
                            className="text-xs font-semibold text-brand-green hover:underline"
                            disabled={publishingId === o.id}
                            onClick={() => publish(o.id)}
                          >
                            {publishingId === o.id ? "…" : "Publish"}
                          </button>
                        )}
                        {(o.status === "published" || o.status === "draft") && (
                          <button
                            type="button"
                            className="text-xs font-medium text-slate-500 hover:text-brand-green"
                            onClick={() => { setEditingId(editingId === o.id ? null : o.id); setExpandedId(o.id); }}
                          >
                            Edit
                          </button>
                        )}
                        {(o.status === "published" || o.status === "draft") && (
                          <button
                            type="button"
                            className="text-xs font-medium text-slate-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={withdrawingId === o.id || hasAccepted(o.id)}
                            title={hasAccepted(o.id) ? "Can't cancel once a response has been accepted" : undefined}
                            onClick={() => setConfirmWithdrawId(o.id)}
                          >
                            {withdrawingId === o.id ? "…" : "Cancel"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {expandedId === o.id && (
                    <tr className="border-t border-brand-edge bg-brand-bg/30">
                      <td colSpan={12} className="p-4">
                        {editingId === o.id ? (
                          <OfferEditForm
                            offer={o}
                            onCancel={() => setEditingId(null)}
                            onSaved={(next) => {
                              setOffers((os) => os.map((x) => (x.id === next.id ? next : x)));
                              setEditingId(null);
                            }}
                          />
                        ) : (
                          <div className="space-y-3 text-sm text-slate-600">
                            <div className="flex gap-6">
                              <div>
                                <span className="font-medium text-slate-700">Protein: </span>
                                {o.protein_pct != null ? `${o.protein_pct}%` : "—"}
                              </div>
                              <div>
                                <span className="font-medium text-slate-700">Moisture: </span>
                                {o.moisture_pct_max != null ? `${o.moisture_pct_max}% Max` : "—"}
                              </div>
                              {o.test_weight != null && (
                                <div>
                                  <span className="font-medium text-slate-700">Test Weight: </span>
                                  {formatNumber(o.test_weight)}
                                </div>
                              )}
                              {o.bcfm_pct != null && (
                                <div>
                                  <span className="font-medium text-slate-700">BCFM: </span>
                                  {o.bcfm_pct}%
                                </div>
                              )}
                              {o.seed_variety && (
                                <div>
                                  <span className="font-medium text-slate-700">Seed Variety: </span>
                                  {o.seed_variety}
                                </div>
                              )}
                              {o.commodity === "Sorghum" && (o.tannin_level_max != null || o.non_tannin_sorghum || o.bnfm_pct != null) && (
                                <div>
                                  <span className="font-medium text-slate-700">Sorghum: </span>
                                  {[
                                    o.tannin_level_max != null && `Tannin Max ${o.tannin_level_max}`,
                                    o.non_tannin_sorghum && "Non-Tannin/White",
                                    o.bnfm_pct != null && `BNFM ${o.bnfm_pct}%`,
                                  ].filter(Boolean).join(" · ")}
                                </div>
                              )}
                              <div>
                                <span className="font-medium text-slate-700">Minimum Delivery Volume: </span>
                                {o.min_order != null ? `${formatNumber(o.min_order)} ${o.uom}` : "—"}
                              </div>
                              <div>
                                <span className="font-medium text-slate-700">Delivery Window: </span>
                                {o.delivery_window_start && o.delivery_window_end ? `${o.delivery_window_start} – ${o.delivery_window_end}` : "—"}
                              </div>
                              <div>
                                <span className="font-medium text-slate-700">Harvest Window: </span>
                                {o.harvest_start && o.harvest_end ? `${o.harvest_start} – ${o.harvest_end}` : "—"}
                              </div>
                            </div>
                            {o.locations.length > 0 && (
                              <div>
                                <span className="font-medium text-slate-700">Locations: </span>
                                {o.locations.map((l) => l.counties.length > 0 ? `${l.counties.join("/")}, ${l.state}` : l.state).join(" · ")}
                              </div>
                            )}
                            {o.sustainability_attributes.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-slate-700">Sustainability:</span>
                                {o.sustainability_attributes.map((a) => <Badge key={a} tone="green" title={attributes.titles[a]}>{a}</Badge>)}
                              </div>
                            )}
                            {o.specialty_attributes.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-slate-700">Specialty:</span>
                                {o.specialty_attributes.map((a) => <Badge key={a} tone="violet" title={attributes.titles[a]}>{a}</Badge>)}
                              </div>
                            )}
                            {o.certifications.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-slate-700">Certifications:</span>
                                {o.certifications.map((c) => <Badge key={c} tone="green" title={certifications.titles[c]}>{c}</Badge>)}
                              </div>
                            )}
                            {hasProduction && p.conservation_practices.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-slate-700">Conservation Practices:</span>
                                {p.conservation_practices.map((a) => <Badge key={a} tone="blue" title={practices.titles[a]}>{a}</Badge>)}
                              </div>
                            )}
                            {o.on_behalf_of_grower_name && (
                              <div><span className="font-medium text-slate-700">On behalf of: </span>{o.on_behalf_of_grower_name}</div>
                            )}

                            <div className="border-t border-brand-edge pt-3">
                              <span className="font-medium text-slate-700">Responses to this listing</span>
                              {offerResponses.length === 0 ? (
                                <p className="mt-1 text-slate-400">No responses yet.</p>
                              ) : (
                                <ul className="mt-1.5 space-y-1">
                                  {offerResponses.map((r) => (
                                    <li key={r.id} className="flex items-center gap-2">
                                      <span className="text-slate-700">{r.responder_name || "Unnamed responder"}</span>
                                      <span className="text-slate-500">{r.proposed_volume != null ? `${r.proposed_volume} ${o.uom}` : "amount tbd"}</span>
                                      <Badge tone={RESPONSE_STATUS_TONE[r.status]}>{r.status}</Badge>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {docsId && (() => {
        const o = offers.find((x) => x.id === docsId);
        if (!o) return null;
        const update = (next: Offer) => setOffers((os) => os.map((x) => (x.id === next.id ? next : x)));
        return (
          <div className="mt-4 card space-y-4 p-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Documents for {o.commodity}{o.variety ? ` — ${o.variety}` : ""}
            </h3>
            <OfferDocumentsPanel offer={o} onChanged={update} />
          </div>
        );
      })()}

      {matchingId && (
        <div className="mt-4">
          <MatchResults listingType="offer" listingId={matchingId} onClose={() => setMatchingId(null)} />
        </div>
      )}

      {confirmWithdrawId && (
        <ConfirmDialog
          title="Cancel this listing?"
          message="This withdraws the listing — it will no longer be visible to buyers. This can't be undone."
          confirmLabel="Cancel Listing"
          busy={withdrawingId === confirmWithdrawId}
          onConfirm={() => withdraw(confirmWithdrawId)}
          onCancel={() => setConfirmWithdrawId(null)}
        />
      )}
    </div>
  );
}

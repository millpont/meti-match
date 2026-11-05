import { Fragment, useEffect, useState } from "react";
import { api } from "../api";
import { Badge, ConfirmDialog, isStale } from "../ui";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import { fromAcres } from "../units";
import { formatCurrency, formatNumber } from "../format";
import type { Bid, ListingResponse, ResponseStatus } from "../types";
import { BID_TYPE_LABELS } from "../listings/constants";
import MatchResults from "../listings/MatchResults";
import BidEditForm from "./BidEditForm";
import DraftBadge from "../listings/DraftBadge";
import { useVerification } from "../profile/VerificationPrompt";
import { ASSET_CLASS_LABELS, assetClassOf, bidUnit, isOutcomeListing } from "../listings/environmental";

const RESPONSE_STATUS_TONE: Record<ResponseStatus, "slate" | "green" | "amber" | "red" | "blue"> = {
  pending: "slate", "in-communication": "blue", "in-negotiation": "amber", accepted: "green", declined: "red",
};

export default function MyBidsTable({ bids: initialBids }: { bids: Bid[] }) {
  const [bids, setBids] = useState(initialBids);
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  const [responses, setResponses] = useState<ListingResponse[]>([]);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const { requireVerified } = useVerification();
  const attributes = useTaxonomyTerms("attribute");
  const practices = useTaxonomyTerms("practice");
  const certifications = useTaxonomyTerms("certification");
  const dataRequirements = useTaxonomyTerms("data_requirement");

  useEffect(() => { setBids(initialBids); }, [initialBids]);

  useEffect(() => {
    api.myResponses().then((r) => setResponses(r.to_my_listings.filter((x) => x.listing_type === "bid"))).catch(() => setResponses([]));
  }, [initialBids]);

  const responsesFor = (bidId: string) => responses.filter((r) => r.listing_id === bidId);
  const hasAccepted = (bidId: string) => responsesFor(bidId).some((r) => r.status === "accepted");

  const refresh = async (id: string) => {
    setRefreshingId(id);
    try {
      await api.touchBid(id);
      setBids((bs) => bs.map((b) => (b.id === id ? { ...b, updated_at: new Date().toISOString() } : b)));
    } catch {
      // best-effort — leave the stale nudge up on failure
    } finally {
      setRefreshingId(null);
    }
  };

  // A draft RFQ goes live here — where business verification is enforced (saving the draft
  // never needed it). Mirrors MyOffersTable's publish.
  const publish = async (id: string) => {
    if (!requireVerified("publish an RFQ")) return;
    setPublishingId(id);
    setPublishError(null);
    try {
      const { bid } = await api.publishBid(id);
      setBids((bs) => bs.map((b) => (b.id === id ? bid : b)));
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Couldn't publish");
    } finally {
      setPublishingId(null);
    }
  };

  const close = async (id: string) => {
    setConfirmCloseId(null);
    setClosingId(id);
    try {
      await api.closeBid(id);
      setBids((bs) => bs.map((b) => (b.id === id ? { ...b, status: "closed" } : b)));
    } catch {
      // best-effort
    } finally {
      setClosingId(null);
    }
  };

  if (bids.length === 0) {
    return <p className="text-sm text-slate-500">You haven&rsquo;t posted any bids yet.</p>;
  }
  return (
    <div>
      {publishError && <p className="mb-2 text-sm text-red-600">{publishError}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2 pr-4">Commodity</th>
              <th className="pb-2 pr-4">Variety</th>
              <th className="pb-2 pr-4">For</th>
              <th className="pb-2 pr-4">Type</th>
              <th className="pb-2 pr-4">Quantity</th>
              <th className="pb-2 pr-4">Price</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Posted</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {bids.map((b) => {
              const bidResponses = responsesFor(b.id);
              // quantity/remaining_quantity are always normalized to acres (same convention as
              // offers.acres_offered) — convert back to the originally-typed unit for display.
              const isAcresBid = b.bid_type === "acres_for_contracting";
              const bidQtyUnit = bidUnit(b);
              const bidPriceUnit = isOutcomeListing(b) ? bidQtyUnit : "MT";
              const displayQuantity = isAcresBid && b.quantity != null ? fromAcres(b.quantity, b.area_unit || "acres") : b.quantity;
              const displayRemaining = isAcresBid && b.remaining_quantity != null ? fromAcres(b.remaining_quantity, b.area_unit || "acres") : b.remaining_quantity;
              return (
                <Fragment key={b.id}>
                  <tr className="cursor-pointer border-t border-brand-edge hover:bg-brand-bg/40" onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}>
                    <td className="py-2 pr-4 font-medium text-slate-800">{b.commodity}</td>
                    <td className="py-2 pr-4 text-slate-600">{b.variety || "—"}</td>
                    <td className="py-2 pr-4 text-slate-600">{b.on_behalf_of_buyer_name || "—"}</td>
                    <td className="py-2 pr-4 text-slate-600">{isOutcomeListing(b) ? ASSET_CLASS_LABELS[assetClassOf(b)] : (BID_TYPE_LABELS[b.bid_type] ?? b.bid_type)}</td>
                    <td className="py-2 pr-4 text-slate-600">
                      {displayQuantity != null ? formatNumber(displayQuantity, isAcresBid ? 1 : 2) : "—"} {bidQtyUnit}
                      {displayRemaining != null && b.remaining_quantity !== b.quantity && (
                        <div className="text-xs text-amber-700">
                          {formatNumber(displayRemaining, 1)} {bidQtyUnit} remaining
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{b.bid_price_usd_per_mt != null ? `${formatCurrency(b.bid_price_usd_per_mt)}/${bidPriceUnit}` : "—"}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-1.5">
                        {b.buyer_approval_status === "pending" ? (
                          <Badge tone="amber">Awaiting Buyer Approval</Badge>
                        ) : b.buyer_approval_status === "declined" ? (
                          <Badge tone="red">Declined by Buyer</Badge>
                        ) : b.status === "draft" ? (
                          <DraftBadge audience="sellers" />
                        ) : (
                          <Badge tone={b.status === "open" ? "green" : "slate"}>{b.status}</Badge>
                        )}
                        {b.status === "open" && isStale(b.updated_at) && <Badge tone="amber">Still valid?</Badge>}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{new Date(b.created_at).toLocaleDateString()}</td>
                    <td className="py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="text-xs font-medium text-brand-green hover:underline"
                          onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                        >
                          {expandedId === b.id ? "Hide Details" : "View Details"}
                        </button>
                        {b.status === "open" && (
                          <button
                            type="button"
                            className="text-xs font-medium text-brand-green hover:underline"
                            onClick={() => setMatchingId(matchingId === b.id ? null : b.id)}
                          >
                            {matchingId === b.id ? "Hide" : "Find Matches"}
                          </button>
                        )}
                        {b.status === "open" && isStale(b.updated_at) && (
                          <button
                            type="button"
                            className="text-xs font-medium text-slate-500 hover:text-brand-green"
                            disabled={refreshingId === b.id}
                            onClick={() => refresh(b.id)}
                          >
                            {refreshingId === b.id ? "…" : "Refresh"}
                          </button>
                        )}
                        {b.status === "draft" && (
                          <button
                            type="button"
                            className="text-xs font-semibold text-brand-green hover:underline"
                            disabled={publishingId === b.id}
                            onClick={() => publish(b.id)}
                          >
                            {publishingId === b.id ? "…" : "Publish"}
                          </button>
                        )}
                        {(b.status === "open" || b.status === "draft") && (
                          <button
                            type="button"
                            className="text-xs font-medium text-slate-500 hover:text-brand-green"
                            onClick={() => { setEditingId(editingId === b.id ? null : b.id); setExpandedId(b.id); }}
                          >
                            Edit
                          </button>
                        )}
                        {(b.status === "open" || b.status === "draft") && (
                          <button
                            type="button"
                            className="text-xs font-medium text-slate-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={closingId === b.id || hasAccepted(b.id)}
                            title={hasAccepted(b.id) ? "Can't cancel once a response has been accepted" : undefined}
                            onClick={() => setConfirmCloseId(b.id)}
                          >
                            {closingId === b.id ? "…" : "Cancel"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {expandedId === b.id && (
                    <tr className="border-t border-brand-edge bg-brand-bg/30">
                      <td colSpan={9} className="p-4">
                        {editingId === b.id ? (
                          <BidEditForm
                            bid={b}
                            onCancel={() => setEditingId(null)}
                            onSaved={(next) => {
                              setBids((bs) => bs.map((x) => (x.id === next.id ? next : x)));
                              setEditingId(null);
                            }}
                          />
                        ) : (
                          <div className="space-y-3 text-sm text-slate-600">
                            <div className="flex gap-6">
                              <div>
                                <span className="font-medium text-slate-700">Delivery Window: </span>
                                {b.delivery_window_start && b.delivery_window_end ? `${b.delivery_window_start} – ${b.delivery_window_end}` : "—"}
                              </div>
                              <div>
                                <span className="font-medium text-slate-700">Destination: </span>
                                {b.destination_country || "—"}
                              </div>
                              <div>
                                <span className="font-medium text-slate-700">Allow Partial: </span>
                                {b.allow_partial ? "Yes" : "No"}
                              </div>
                            </div>
                            {b.required_attributes.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-slate-700">Required Attributes:</span>
                                {b.required_attributes.map((a) => (
                                  <Badge key={a} tone="green" title={b.required_attribute_notes[a] || attributes.titles[a]}>{a}</Badge>
                                ))}
                              </div>
                            )}
                            {b.required_practices.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-slate-700">Required Practices:</span>
                                {b.required_practices.map((a) => <Badge key={a} tone="blue" title={practices.titles[a]}>{a}</Badge>)}
                              </div>
                            )}
                            {b.required_certifications.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-slate-700">Required Certifications:</span>
                                {b.required_certifications.map((a) => <Badge key={a} tone="green" title={certifications.titles[a]}>{a}</Badge>)}
                              </div>
                            )}
                            {b.required_data_requirements.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-slate-700">Data Requirements:</span>
                                {b.required_data_requirements.map((a) => <Badge key={a} tone="slate" title={dataRequirements.titles[a]}>{a}</Badge>)}
                              </div>
                            )}
                            {b.on_behalf_of_buyer_name && (
                              <div><span className="font-medium text-slate-700">On behalf of: </span>{b.on_behalf_of_buyer_name}</div>
                            )}

                            <div className="border-t border-brand-edge pt-3">
                              <span className="font-medium text-slate-700">Responses to this listing</span>
                              {bidResponses.length === 0 ? (
                                <p className="mt-1 text-slate-400">No responses yet.</p>
                              ) : (
                                <ul className="mt-1.5 space-y-1">
                                  {bidResponses.map((r) => (
                                    <li key={r.id} className="flex items-center gap-2">
                                      <span className="text-slate-700">{r.responder_name || "Unnamed responder"}</span>
                                      <span className="text-slate-500">
                                        {r.proposed_volume != null ? `${r.proposed_volume} ${isOutcomeListing(b) ? bidUnit(b) : b.bid_type === "acres_for_contracting" ? "acres" : "MT"}` : "amount tbd"}
                                      </span>
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

      {matchingId && (
        <div className="mt-4">
          <MatchResults listingType="bid" listingId={matchingId} onClose={() => setMatchingId(null)} />
        </div>
      )}

      {confirmCloseId && (
        <ConfirmDialog
          title="Cancel this listing?"
          message="This closes the bid — it will no longer be visible to growers. This can't be undone."
          confirmLabel="Cancel Listing"
          busy={closingId === confirmCloseId}
          onConfirm={() => close(confirmCloseId)}
          onCancel={() => setConfirmCloseId(null)}
        />
      )}
    </div>
  );
}

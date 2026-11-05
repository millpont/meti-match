import { useEffect, useState } from "react";
import { api } from "../api";
import { Spinner } from "../ui";
import type { MatchCandidate } from "../types";
import MatchScoreRing from "./MatchScoreRing";

/** Ranked, scored counterparties for one of the caller's own listings (page 18's "Signal Match
 * Results"). `listingType`/`listingId` identify the listing being matched; the candidates are
 * always the opposite side (an offer's candidates are bids, and vice versa). */
export default function MatchResults({
  listingType, listingId, onClose,
}: {
  listingType: "offer" | "bid";
  listingId: string;
  onClose: () => void;
}) {
  const [matches, setMatches] = useState<MatchCandidate[] | null>(null);
  const [respondedIds, setRespondedIds] = useState<Set<string>>(new Set());
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMatches(null);
    api.matchingPreview(listingType, listingId).then((r) => setMatches(r.matches)).catch(() => setMatches([]));
  }, [listingType, listingId]);

  const respond = async (m: MatchCandidate) => {
    setRespondingId(m.candidate_id);
    setError(null);
    try {
      if (m.candidate_type === "bid") await api.respondToBid(m.candidate_id, { matchScore: m.match_score });
      else await api.respondToOffer(m.candidate_id, { matchScore: m.match_score });
      setRespondedIds((s) => new Set(s).add(m.candidate_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setRespondingId(null);
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Signal Match Results</h2>
        <button type="button" className="text-sm text-slate-500 hover:text-slate-700" onClick={onClose}>Close</button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {matches === null ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : matches.length === 0 ? (
        <p className="text-sm text-slate-500">No matching counterparties right now.</p>
      ) : (
        <div className="space-y-3">
          {matches.map((m) => {
            const responded = respondedIds.has(m.candidate_id);
            const quantity = m.candidate_type === "bid" ? m.quantity : m.expected_volume;
            return (
              <div key={m.candidate_id} className="flex flex-wrap items-center gap-4 rounded-lg border border-brand-edge p-3">
                <MatchScoreRing score={m.match_score} />
                <div className="min-w-[180px] flex-1">
                  <div className="font-medium text-slate-900">
                    {m.commodity}{m.variety ? ` — ${m.variety}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {quantity ?? "—"} {m.candidate_type === "offer" ? (m.uom ?? "") : "MT"}
                    {m.candidate_type === "offer" && m.uom === "bushels" && m.mt_equivalent != null &&
                      ` (${m.mt_equivalent.toFixed(1)} MT)`}
                    {m.candidate_type === "bid" && m.implied_total_value_usd != null &&
                      ` · ≈ $${m.implied_total_value_usd.toLocaleString()} at their price`}
                    {m.rationale.commodity_variety_match.variety_matched && " · Variety match"}
                    {" · "}Delivery window {m.rationale.delivery_window_overlap.overlap_pct}%
                    {!m.rationale.delivery_window_overlap.known && " (est.)"}
                    {" · "}Quality {m.rationale.quality_attribute_match.covered_pct}% covered
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {m.rationale.counterparty_reliability.completed_contracts > 0 ? (
                      <>
                        Reliability: {m.rationale.counterparty_reliability.completed_contracts} completed agreement
                        {m.rationale.counterparty_reliability.completed_contracts === 1 ? "" : "s"}
                        {m.rationale.counterparty_reliability.on_time_rate != null &&
                          `, ${Math.round(m.rationale.counterparty_reliability.on_time_rate * 100)}% on time`}
                      </>
                    ) : (
                      "Reliability: no completed agreements on file yet"
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn shrink-0 bg-brand-gold text-white hover:brightness-95"
                  disabled={responded || respondingId === m.candidate_id}
                  onClick={() => respond(m)}
                >
                  {responded ? "Sent" : respondingId === m.candidate_id ? "Sending…" : "Bid"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

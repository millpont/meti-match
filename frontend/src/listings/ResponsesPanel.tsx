import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Badge, EmptyState, Spinner } from "../ui";
import { useAppNav } from "../AppNavContext";
import { formatNumber } from "../format";
import { ACCOUNT_ROLE_LABELS } from "../onboarding/constants";
import type { ListingResponse, ResponseStatus } from "../types";
import ResponseThread from "./ResponseThread";
import ProfileLink from "../profile/ProfileLink";

/** Both directions of response activity for the current account: responses made against
 * listings I created (I'm the creator, full status controls) and responses I made myself (I'm
 * the responder, chat only). Which listing type ends up in each bucket falls out naturally from
 * who's allowed to create which listing — growers only ever see offers here as creator and bids
 * as responder; buyers see the reverse. */
export default function ResponsesPanel() {
  const [data, setData] = useState<{ made_by_me: ListingResponse[]; to_my_listings: ListingResponse[] } | null>(null);
  const { focus, clearFocus } = useAppNav();
  // A notification click asks for one specific response — opened and scrolled to once loaded.
  const focusId = focus?.kind === "response" ? focus.id : null;

  const load = () => api.myResponses().then(setData).catch(() => setData({ made_by_me: [], to_my_listings: [] }));
  // Reload when a notification points here too — the response it's about may be newer than
  // the list this tab loaded when it was first opened.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [focusId]);

  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;

  const patchStatus = (list: "made_by_me" | "to_my_listings", id: string, status: ResponseStatus) =>
    setData((d) => d && {
      ...d,
      [list]: d[list].map((r) => (r.id === id ? { ...r, status, awaiting_my_reply: false } : r)),
    });

  const waitingCount = [...data.to_my_listings, ...data.made_by_me].filter((r) => r.awaiting_my_reply).length;

  return (
    <div className="space-y-8">
      {waitingCount > 0 && (
        <p className="rounded-lg bg-brand-gold/10 px-4 py-2 text-sm text-slate-700">
          <span className="font-semibold">{waitingCount}</span> {waitingCount === 1 ? "response is" : "responses are"} waiting on you — marked <Badge tone="amber">Needs your reply</Badge> below.
        </p>
      )}
      <section>
        <h2 className="text-base font-semibold text-slate-900">Responses to your listings</h2>
        {data.to_my_listings.length === 0 ? (
          <EmptyState title="No responses yet" hint="Once someone responds to one of your listings, it'll show up here." />
        ) : (
          <div className="mt-3 space-y-3">
            {data.to_my_listings.map((r) => (
              <ResponseCard key={r.id} r={r} isCreator focused={r.id === focusId} onFocused={clearFocus}
                onStatusChange={(s) => patchStatus("to_my_listings", r.id, s)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-900">Your responses</h2>
        {data.made_by_me.length === 0 ? (
          <EmptyState title="You haven't responded to anything yet" />
        ) : (
          <div className="mt-3 space-y-3">
            {data.made_by_me.map((r) => (
              <ResponseCard key={r.id} r={r} isCreator={false} focused={r.id === focusId} onFocused={clearFocus} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ResponseCard({
  r, isCreator, focused, onFocused, onStatusChange,
}: {
  r: ListingResponse;
  isCreator: boolean;
  focused: boolean;
  onFocused: () => void;
  onStatusChange?: (s: ResponseStatus) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focused) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    onFocused();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const s = r.listing_summary;
  const cp = r.counterparty;
  return (
    <div ref={ref} className={`card p-4 ${r.awaiting_my_reply ? "border-brand-gold" : ""} ${focused ? "ring-2 ring-brand-green" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-800">
              {s ? `${s.commodity}${s.variety ? ` (${s.variety})` : ""} — ${s.quantity != null ? formatNumber(s.quantity) : "—"} ${s.uom ?? ""}` : "Listing"}
            </span>
            {r.awaiting_my_reply && <Badge tone="amber">{isCreator && r.status === "pending" ? "New — needs your reply" : "Needs your reply"}</Badge>}
          </div>
          {cp && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
              <span className="text-slate-500">{isCreator ? "From" : "With"}</span>
              <span className="font-semibold text-slate-800">{cp.organization_name ?? "Unknown organization"}</span>
              {cp.person_name && <span>· {cp.person_name}</span>}
              {cp.role && <span className="text-slate-400">· {ACCOUNT_ROLE_LABELS[cp.role] ?? cp.role}</span>}
              {cp.account_id && <span>· <ProfileLink accountId={cp.account_id} /></span>}
            </div>
          )}
          {(r.proposed_volume != null || r.proposed_price != null) && (
            <div className="mt-1 text-xs text-slate-500">
              {r.proposed_volume != null && <>Requested amount: {formatNumber(r.proposed_volume)} {s?.uom ?? ""}</>}
              {r.proposed_volume != null && r.proposed_price != null && " · "}
              {r.proposed_price != null && <>Proposed price: ${formatNumber(r.proposed_price)}</>}
            </div>
          )}
        </div>
        <span className="text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString()}</span>
      </div>
      {r.last_message ? (
        <p className="mt-2 rounded-lg bg-brand-bg px-3 py-2 text-sm text-slate-700">
          <span className="font-medium">{r.last_message.is_mine ? "You" : (cp?.person_name || cp?.organization_name || "They")}: </span>
          {r.last_message.body}
          <span className="ml-2 text-[11px] text-slate-400">
            {new Date(r.last_message.created_at).toLocaleString()}
            {r.message_count > 1 && ` · ${r.message_count} messages`}
          </span>
        </p>
      ) : r.status === "pending" ? (
        <p className="mt-2 text-xs text-slate-500">
          {isCreator
            ? `${cp?.organization_name ?? "They"} asked to connect about this listing. Start communication below to reply.`
            : "Request sent — the lister has been notified and may reach out here."}
        </p>
      ) : null}
      <ResponseThread
        responseId={r.id}
        isCreator={isCreator}
        status={r.status}
        onStatusChange={onStatusChange}
        defaultOpen={focused}
      />
    </div>
  );
}

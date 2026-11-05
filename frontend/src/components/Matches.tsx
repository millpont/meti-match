import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { MatchDeal, MatchStatus } from "../types";
import { STATUS_LABELS } from "../constants";
import { Badge, EmptyState, Spinner } from "../ui";
import { assetTypes } from "./DealCard";
import ChatThread from "./ChatThread";
import Confetti from "./Confetti";

// Which transitions the deal creator can drive from each current status. Accept -> "Match"
// (deal-made), Reject -> "Rejected" (declined); either is terminal and stays logged. Negotiate
// is an optional working step. Chat is available the whole time (see below), for both parties.
const ACCEPT = { status: "deal-made" as MatchStatus, label: "Accept ✓", tone: "primary" as const };
const NEGOTIATE = { status: "in-negotiation" as MatchStatus, label: "Negotiate", tone: "ghost" as const };
const REJECT = { status: "declined" as MatchStatus, label: "Reject", tone: "ghost" as const };

const NEXT_ACTIONS: Record<string, { status: MatchStatus; label: string; tone: "primary" | "ghost" }[]> = {
  pending: [ACCEPT, NEGOTIATE, REJECT],
  none: [ACCEPT, NEGOTIATE, REJECT],
  "in-communication": [ACCEPT, NEGOTIATE, REJECT],
  "in-negotiation": [ACCEPT, REJECT],
  // "deal-made" (Match) and "declined" (Rejected) are terminal — no further actions.
};

export default function Matches() {
  const [deals, setDeals] = useState<MatchDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDeals((await api.matches()).matches);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function setStatus(dealId: string, accountId: string, status: MatchStatus) {
    setBusy(`${dealId}:${accountId}`);
    try {
      await api.updateStatus(dealId, accountId, status);
      if (status === "deal-made") {
        setCelebrate(true);
        setTimeout(() => setCelebrate(false), 3500);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (deals.length === 0) {
    return <EmptyState title="No active matches" hint="Express interest on the boards, or wait for interest in your deals." />;
  }

  return (
    <div className="space-y-4">
      {celebrate && <Confetti />}
      <h2 className="text-lg font-bold text-white">Matches</h2>
      {deals.map((deal) => (
        <div key={deal.id} className="card p-5">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <Badge tone={deal.account_type === "buyer" ? "blue" : "green"}>
              {deal.account_type === "buyer" ? "Buyer" : "Seller"}
            </Badge>
            {assetTypes(deal).map((a) => (
              <Badge key={a} tone={a === "Carbon" ? "green" : a === "Water" ? "blue" : "amber"}>{a}</Badge>
            ))}
            <span className="text-sm font-medium text-slate-200">{deal.commodity.join(", ")}</span>
            <span className="text-sm text-slate-500">· {deal.state.join(", ")} · {deal.year.join(", ")}</span>
            <span className="ml-auto text-xs text-slate-500">{deal.is_creator ? "Your deal" : "You expressed interest"}</span>
          </div>

          <div className="space-y-2">
            {Object.entries(deal.parties).map(([accountId, party]) => {
              const status = party.status;
              const key = `${status ?? "none"}`;
              const actions = deal.is_creator ? NEXT_ACTIONS[key] ?? [] : [];
              const working = busy === `${deal.id}:${accountId}`;
              return (
                <div key={accountId} className="rounded-lg border border-brand-edge px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-200">{party.name}</span>
                    <StatusBadge status={status} />
                    {deal.is_creator ? (
                      <div className="ml-auto flex gap-2">
                        {actions.map((a) => (
                          <button
                            key={a.status}
                            className={a.tone === "primary" ? "btn-primary text-xs" : "btn-ghost text-xs"}
                            disabled={working}
                            onClick={() => setStatus(deal.id, accountId, a.status)}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="ml-auto text-xs text-slate-500">{partyStatusNote(status)}</span>
                    )}
                  </div>
                  {status !== "declined" && (
                    <ChatThread
                      dealId={deal.id}
                      party={deal.is_creator ? accountId : undefined}
                      counterpartyName={party.name}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// What the interested party (non-creator) sees about where their interest stands.
function partyStatusNote(status: MatchStatus | null): string {
  switch (status) {
    case "deal-made": return "🎉 You're matched!";
    case "declined": return "This match was rejected";
    case "in-negotiation":
    case "in-communication": return "Deal creator is engaging";
    default: return "Waiting for the deal creator to respond";
  }
}

function StatusBadge({ status }: { status: MatchStatus | null }) {
  if (!status) return <Badge tone="slate">Pending</Badge>;
  const tone = status === "deal-made" ? "green" : status === "declined" ? "red" : "amber";
  return <Badge tone={tone}>{STATUS_LABELS[status] ?? status}</Badge>;
}

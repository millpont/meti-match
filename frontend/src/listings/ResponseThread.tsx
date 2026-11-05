import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, ConfirmDialog, Spinner } from "../ui";
import { useAppNav } from "../AppNavContext";
import type { ChatMessage, ResponseStatus } from "../types";

const STATUS_TONE: Record<ResponseStatus, "slate" | "green" | "amber" | "red" | "blue"> = {
  pending: "amber", "in-communication": "blue", "in-negotiation": "blue",
  accepted: "green", declined: "red",
};

const STATUS_LABEL: Record<ResponseStatus, string> = {
  pending: "Pending", "in-communication": "In Communication", "in-negotiation": "In Negotiation",
  accepted: "Accepted", declined: "Declined",
};

/** Chat + (for the listing's creator) status controls for one response. Shared between the
 * grower and buyer dashboards — a response has exactly one creator side and one responder side,
 * and the caller tells us which one the current viewer is. */
export default function ResponseThread({
  responseId, isCreator, status, onStatusChange, defaultOpen,
}: {
  responseId: string;
  isCreator: boolean;
  status: ResponseStatus;
  onStatusChange?: (next: ResponseStatus) => void;
  /** Start with the conversation expanded — e.g. when a notification click brought them here. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [confirmAccept, setConfirmAccept] = useState(false);
  // Set only by an accept made in this session — drives the one-time "Agreement reached"
  // celebration; an already-accepted response just shows the quieter banner below.
  const [justAccepted, setJustAccepted] = useState(false);
  const { goToDashboardTab } = useAppNav();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.listResponseMessages(responseId).then((r) => setMessages(r.messages)).catch(() => setMessages([]));

  useEffect(() => { if (defaultOpen) setOpen(true); }, [defaultOpen]);

  useEffect(() => {
    if (open && messages === null) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      await api.sendResponseMessage(responseId, body);
      setDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (next: ResponseStatus) => {
    setUpdating(true);
    setError(null);
    try {
      await api.updateResponseStatus(responseId, next);
      if (next === "accepted") setJustAccepted(true);
      onStatusChange?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setUpdating(false);
    }
  };

  const canChat = status === "in-communication" || status === "in-negotiation" || status === "accepted";

  return (
    <div className="mt-2 border-t border-brand-edge pt-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
          {isCreator && status === "pending" && (
            <>
              <button className="btn-ghost !py-1 !px-2 text-xs" disabled={updating} onClick={() => setStatus("in-communication")}>Start Communication</button>
              <button className="btn-ghost !py-1 !px-2 text-xs text-red-600" disabled={updating} onClick={() => setStatus("declined")}>Decline</button>
            </>
          )}
          {isCreator && status === "in-communication" && (
            <>
              <button className="btn-ghost !py-1 !px-2 text-xs" disabled={updating} onClick={() => setStatus("in-negotiation")}>Move to Negotiation</button>
              <button className="btn-ghost !py-1 !px-2 text-xs text-red-600" disabled={updating} onClick={() => setStatus("declined")}>Decline</button>
            </>
          )}
          {isCreator && status === "in-negotiation" && (
            <>
              <button className="btn-primary !py-1 !px-2 text-xs" disabled={updating} onClick={() => setConfirmAccept(true)}>Accept &amp; Reach Agreement</button>
              <button className="btn-ghost !py-1 !px-2 text-xs text-red-600" disabled={updating} onClick={() => setStatus("declined")}>Decline</button>
            </>
          )}
        </div>
        <button className="text-xs font-medium text-brand-green hover:underline" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide conversation" : "View conversation"}
        </button>
      </div>

      {error && !open && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {status === "in-negotiation" && !isCreator && (
        <p className="mt-2 text-xs text-slate-500">
          In negotiation — once the listing owner accepts, an agreement is created and appears in your Agreements tab.
        </p>
      )}

      {status === "accepted" && (
        <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
          justAccepted ? "bg-emerald-50 text-emerald-800" : "bg-brand-bg text-slate-700"
        }`}>
          <span>
            <span className="font-semibold">Agreement reached.</span>{" "}
            {justAccepted
              ? "Both parties have been notified. Delivery tracking, documents and any disputes now live in the Agreements tab."
              : "This deal is now tracked in the Agreements tab."}
          </span>
          <button type="button" className="btn-primary !py-1 !px-3 text-xs" onClick={() => goToDashboardTab("contracts")}>
            Go to Agreements →
          </button>
        </div>
      )}

      {confirmAccept && (
        <ConfirmDialog
          title="Accept and reach an agreement?"
          message="Accepting confirms the terms you've negotiated and creates an Agreement between you and the other party. The other party is notified, and the deal moves to your Agreements tab for delivery tracking."
          confirmLabel="Accept & Create Agreement"
          busy={updating}
          onConfirm={async () => { await setStatus("accepted"); setConfirmAccept(false); }}
          onCancel={() => setConfirmAccept(false)}
        />
      )}

      {open && (
        <div className="mt-2">
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          {messages === null ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : (
            <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg bg-brand-bg p-3">
              {messages.length === 0 && <p className="text-xs text-slate-500">No messages yet.</p>}
              {messages.map((m) => (
                <div key={m.id} className={`text-sm ${m.is_mine ? "text-right" : ""}`}>
                  <div className={`inline-block rounded-lg px-3 py-1.5 ${m.is_mine ? "bg-brand-green text-white" : "bg-white border border-brand-edge text-slate-800"}`}>
                    {m.body}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">{m.sender_name} · {new Date(m.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
          {canChat ? (
            <div className="mt-2 flex gap-2">
              <input
                className="field"
                placeholder="Write a message…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <button className="btn-primary shrink-0" disabled={sending || !draft.trim()} onClick={send}>
                {sending ? "…" : "Send"}
              </button>
            </div>
          ) : status === "pending" ? (
            <p className="mt-2 text-xs text-slate-500">
              {isCreator ? "Click “Start Communication” above to begin messaging." : "Waiting for the listing owner to start communication."}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

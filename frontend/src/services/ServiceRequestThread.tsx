import { useEffect, useState } from "react";
import { api } from "../api";
import { Spinner } from "../ui";
import type { ChatMessage } from "../types";

/** Chat for one ACCEPTED service request — mirrors listings/ResponseThread.tsx's inline
 * expand/collapse conversation panel, but with no status-transition controls of its own (accept/
 * decline already happen via PendingServiceRequests.tsx before this ever renders). Previously,
 * accepting a service request had no follow-up: this is the "move them to chat" step. */
export default function ServiceRequestThread({ requestId }: { requestId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.listServiceRequestMessages(requestId).then((r) => setMessages(r.messages)).catch(() => setMessages([]));

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
      await api.sendServiceRequestMessage(requestId, body);
      setDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-2 border-t border-brand-edge pt-2">
      <button className="text-xs font-medium text-brand-green hover:underline" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide conversation" : "View conversation"}
      </button>

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
        </div>
      )}
    </div>
  );
}

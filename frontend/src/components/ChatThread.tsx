import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { ChatMessage } from "../types";

const POLL_MS = 3000;

// A per-negotiation chat between the deal creator and one interested party. `party` is passed
// only when the current user is the creator (to select the thread); an interested party's own
// thread is inferred by the server. Messages poll every few seconds while the panel is open.
export default function ChatThread({
  dealId,
  party,
  counterpartyName,
}: {
  dealId: string;
  party?: string;
  counterpartyName: string;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const { messages } = await api.listMessages(dealId, party);
      setMessages(messages);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load messages");
    }
  }, [dealId, party]);

  // Poll while the panel is open.
  useEffect(() => {
    if (!open) return;
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [open, refresh]);

  // Keep the view pinned to the latest message.
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await api.sendMessage(dealId, body, party);
      setDraft("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-ghost mt-2 w-full text-xs" onClick={() => setOpen(true)}>
        💬 Open chat with {counterpartyName}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-brand-edge bg-grain-dark/60">
      <div className="flex items-center justify-between border-b border-brand-edge px-3 py-2">
        <span className="text-xs font-semibold text-slate-300">Chat · {counterpartyName}</span>
        <button className="text-xs text-slate-500 hover:text-slate-300" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <div ref={scrollRef} className="max-h-64 space-y-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            No messages yet — say hello to start the conversation.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.is_mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                  m.is_mine ? "bg-grain-blue text-white" : "bg-brand-panel text-slate-200"
                }`}
              >
                {!m.is_mine && (
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {m.sender_name}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className={`mt-1 text-[10px] ${m.is_mine ? "text-indigo-200" : "text-slate-500"}`}>
                  {new Date(m.created_at).toLocaleString([], {
                    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {error && <div className="px-3 pb-1 text-[11px] text-red-400">{error}</div>}

      <div className="flex items-end gap-2 border-t border-brand-edge p-2">
        <textarea
          className="field min-h-[38px] resize-none text-sm"
          rows={1}
          placeholder="Type a message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="btn-primary text-xs" disabled={sending || !draft.trim()} onClick={() => void send()}>
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

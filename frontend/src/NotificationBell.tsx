import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { BellIcon } from "./icons";
import type { AccountRole, Notification } from "./types";
import { useAppNav, type NavFocus } from "./AppNavContext";

const POLL_MS = 30_000;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Where clicking a notification should take this role: a dashboard tab id (from that role's
 * dashboard TABS) plus, for a response, which thread to open. null = nowhere specific (e.g. a
 * company join request, which lives in the separate company-admin bell). */
export function notificationTarget(n: Notification, role: AccountRole | null | undefined): { tab: string; focus?: NavFocus } | null {
  switch (n.link_type) {
    case "response":
      return { tab: "responses", focus: n.link_id ? { kind: "response", id: n.link_id } : undefined };
    case "agreement":
    case "dispute":
      return { tab: "contracts" };
    case "offer":
      // Grower: an operator's on-behalf listing awaiting their approval sits under My Listings.
      // Operator: the approved/declined listing is in their own My Listings too.
      return { tab: "offers" };
    case "bid":
      // Both sides land on My Listings — a buyer's pending on-behalf approvals render there too.
      return { tab: "bids" };
    case "representation":
      // A buyer's pending representation requests sit on their My Listings tab.
      return { tab: role === "service_provider" ? "buyers" : "bids" };
    case "service_request":
      return { tab: role === "service_provider" ? "service_requests" : "services" };
    case "enrollment":
      return { tab: role === "program_operator" ? "growers" : "program" };
    default:
      return null;
  }
}

/** Bell icon in the app header — polls for unread in-app notifications (a response on your
 * listing, a status change, a new negotiation message, a dispute raised/resolved). Real OS/
 * browser push would need a service worker + VAPID keys + a permission prompt; this is the
 * simpler in-app foundation. See notifications_routes.py. */
export default function NotificationBell({ role }: { role?: AccountRole | null }) {
  const { goToDashboardTab } = useAppNav();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => {
    api.notifications()
      .then((r) => { setNotifications(r.notifications); setUnreadCount(r.unread_count); })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  const markRead = async (n: Notification) => {
    if (n.read) return;
    setNotifications((ns) => ns.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.markNotificationRead(n.id);
    } catch {
      // best-effort — next poll reconciles state either way
    }
  };

  const markAllRead = async () => {
    setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await api.markAllNotificationsRead();
    } catch {
      // best-effort
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Notifications"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-gold px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-lg border border-brand-edge bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-brand-edge px-3 py-2">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="text-xs font-medium text-brand-green hover:underline" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    markRead(n);
                    const target = notificationTarget(n, role);
                    if (target) {
                      setOpen(false);
                      goToDashboardTab(target.tab, target.focus);
                    }
                  }}
                  className={`block w-full border-b border-brand-edge px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-brand-bg ${
                    n.read ? "text-slate-500" : "bg-brand-greenLight/40 text-slate-800"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-gold" />}
                    <div className="min-w-0 flex-1">
                      <div className={`truncate ${n.read ? "" : "font-medium"}`}>{n.title}</div>
                      {n.body && <div className="mt-0.5 truncate text-xs text-slate-500">{n.body}</div>}
                      <div className="mt-0.5 text-[11px] text-slate-400">{timeAgo(n.created_at)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

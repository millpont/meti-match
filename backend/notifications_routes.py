"""In-app notification center. `notify()` is the shared entry point other route modules call
right after the event they're about (a response created, a status change, a new message, a
dispute raised/resolved) — see responses_routes.py and contracts_routes.py for the call sites.

Real OS/browser push is a separate, larger lift (service worker, VAPID keys, a permission
prompt) — this is in-app only: a bell icon polls GET /api/notifications for the unread count and
recent list. See migrations/0020_notifications.sql.
"""
import logging

from flask import Blueprint, jsonify, session

import sb
from auth import requires_auth

logger = logging.getLogger(__name__)
notifications_bp = Blueprint("notifications", __name__)

TABLE = "notifications"
RECENT_LIMIT = 50


def notify(account_id, notif_type, title, body=None, link_type=None, link_id=None):
    """Best-effort — a notification failing to write should never break the action that
    triggered it (e.g. a response should still save even if this insert fails)."""
    try:
        sb.insert(TABLE, {
            "account_id": str(account_id),
            "type": notif_type,
            "title": title,
            "body": body,
            "link_type": link_type,
            "link_id": str(link_id) if link_id else None,
        }, return_representation=False)
    except sb.SupabaseError as e:
        logger.error("failed to create notification (%s for %s): %s", notif_type, account_id, e)


def _require_account():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    return str(acct), None


def _notification_json(row):
    d = dict(row)
    d["id"] = str(d["id"])
    d["link_id"] = str(d["link_id"]) if d.get("link_id") else None
    return d


@notifications_bp.route("/api/notifications", methods=["GET"])
@requires_auth
def list_notifications():
    acct, err = _require_account()
    if err:
        return err
    rows = sb.select(TABLE, {
        "account_id": f"eq.{acct}", "order": "created_at.desc", "limit": RECENT_LIMIT, "select": "*",
    })
    unread = sb.select(TABLE, {"account_id": f"eq.{acct}", "read": "eq.false", "select": "id"})
    return jsonify({
        "success": True,
        "notifications": [_notification_json(r) for r in rows],
        "unread_count": len(unread),
    })


@notifications_bp.route("/api/notifications/<notification_id>/read", methods=["PATCH"])
@requires_auth
def mark_read(notification_id):
    acct, err = _require_account()
    if err:
        return err
    sb.update(TABLE, {"id": f"eq.{notification_id}", "account_id": f"eq.{acct}"}, {"read": True})
    return jsonify({"success": True})


@notifications_bp.route("/api/notifications/read-all", methods=["PATCH"])
@requires_auth
def mark_all_read():
    acct, err = _require_account()
    if err:
        return err
    sb.update(TABLE, {"account_id": f"eq.{acct}", "read": "eq.false"}, {"read": True})
    return jsonify({"success": True})

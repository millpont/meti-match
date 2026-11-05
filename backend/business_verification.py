"""Business verification — what an account must supply before it can transact.

Replaces the EIN-last-4 + company-documents step that used to sit in signup (client feedback:
it discouraged people from exploring the platform). Registration is now just contact details;
an account can browse, set up its profile and save draft listings freely, but publishing a
listing or responding to one requires ONE role-appropriate business identifier plus at least one
supporting document (account_documents). Both live on the Profile tab; the SPA pops up a
"complete your business verification" prompt pointing there when a gated action is refused with
the VERIFICATION_REQUIRED code below.

Gated by config.BUSINESS_VERIFICATION_REQUIRED (on by default). Superadmins are never gated."""
from flask import jsonify

import sb
from auth import is_superadmin
from config import config

# Which identifier kinds each role may supply — per the client's list:
#   Grower / Service Provider: EIN, or a state registration identifier.
#   Program Operator: EIN, or the state identifier of a parent/affiliate organization.
#   International Buyer: official registration/incorporation number in the country of origin.
ID_TYPES_BY_ROLE = {
    "grower": ("ein", "state_registration"),
    "service_provider": ("ein", "state_registration"),
    "program_operator": ("ein", "parent_state_registration"),
    "international_buyer": ("foreign_registration",),
}
ID_TYPE_LABELS = {
    "ein": "Employer Identification Number (EIN)",
    "state_registration": "State registration identifier (charter, entity, file, registration or SOS number)",
    "parent_state_registration": "State identifier of parent or affiliate organization (charter, entity, file, registration or SOS number)",
    "foreign_registration": "Official registration / incorporation number in country of origin",
}
VERIFICATION_REQUIRED = "business_verification_required"


def verification_state(account_id, role):
    """{identifier_type, identifier_value, document_count, complete, allowed_types} for one
    account. `role` picks which identifier kinds are acceptable (the active session role — a
    multi-role account's identifier just has to be valid for whichever role it's acting as)."""
    rows = sb.select("accounts", {
        "id": f"eq.{account_id}", "select": "business_id_type,business_id_value", "limit": 1,
    })
    row = rows[0] if rows else {}
    docs = sb.select("account_documents", {"account_id": f"eq.{account_id}", "select": "id"})
    allowed = ID_TYPES_BY_ROLE.get(role, tuple(ID_TYPE_LABELS))
    id_type = row.get("business_id_type")
    id_value = (row.get("business_id_value") or "").strip()
    has_identifier = bool(id_value) and id_type in allowed
    return {
        "identifier_type": id_type,
        "identifier_value": id_value or None,
        "document_count": len(docs),
        "has_identifier": has_identifier,
        "complete": has_identifier and len(docs) > 0,
        "allowed_types": [{"id": t, "label": ID_TYPE_LABELS[t]} for t in allowed],
    }


def is_verified(account_id, role):
    if not config.BUSINESS_VERIFICATION_REQUIRED or is_superadmin():
        return True
    return verification_state(account_id, role)["complete"]


def require_verified(account_id, role, action):
    """None if this account may transact, else a 403 response the SPA recognizes by `code` and
    answers with its "complete your business verification" popup. `action` finishes the
    sentence "...before you can ___"."""
    if is_verified(account_id, role):
        return None
    return jsonify({
        "error": f"Add a business identifier and at least one company document in My Profile before you can {action}.",
        "code": VERIFICATION_REQUIRED,
    }), 403

import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge } from "../ui";
import type { BusinessIdType, BusinessVerification } from "../types";
import AccountDocumentsPanel from "./AccountDocumentsPanel";

/** Fired when this account's verification status may have changed, so App can refetch /api/me
 * (whose business_verified drives the pre-emptive prompts). */
export const VERIFICATION_CHANGED_EVENT = "grains:business-verification-changed";

/** Business verification on the Profile tab — what moved out of signup. One role-appropriate
 * identifier plus at least one supporting document unlocks publishing and responding to listings
 * (see backend/business_verification.py). */
export default function BusinessVerificationPanel() {
  const [state, setState] = useState<BusinessVerification | null>(null);
  const [idType, setIdType] = useState<BusinessIdType | "">("");
  const [idValue, setIdValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = (v: BusinessVerification) => {
    const wasComplete = state?.complete;
    setState(v);
    setIdType(v.identifier_type && v.allowed_types.some((t) => t.id === v.identifier_type) ? v.identifier_type : (v.allowed_types[0]?.id ?? ""));
    setIdValue(v.identifier_value ?? "");
    if (wasComplete !== undefined && wasComplete !== v.complete) window.dispatchEvent(new Event(VERIFICATION_CHANGED_EVENT));
  };
  const load = () => api.businessVerification().then((r) => apply(r.verification)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!idType || !idValue.trim()) return setError("Pick an identifier type and enter its number");
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.saveBusinessIdentifier(idType, idValue.trim());
      apply(r.verification);
      setNotice(r.verification.complete ? "Saved — your account is verified to transact." : "Identifier saved. Now add at least one supporting document below.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (!state) return null;

  return (
    <div id="business-verification" className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Business Verification</h2>
        {state.complete ? <Badge tone="green">Verified to transact</Badge> : <Badge tone="amber">Required before you transact</Badge>}
      </div>
      <p className="text-sm text-slate-600">
        You can explore the marketplace, build your profile and save draft listings without this.
        To <span className="font-medium">publish a listing or respond to one</span>, add one business identifier
        and at least one supporting document (e.g. Articles of Organization, IRS confirmation letter, or your
        registration certificate).
        {!state.required && " (Not currently enforced on this marketplace.)"}
      </p>

      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          1. Business identifier {state.has_identifier && <span className="text-emerald-700">✓</span>}
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label className="label">Identifier type</label>
            <select className="field" value={idType} onChange={(e) => setIdType(e.target.value as BusinessIdType)}>
              {state.allowed_types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Number</label>
            <input className="field" value={idValue} onChange={(e) => setIdValue(e.target.value)}
              placeholder={idType === "ein" ? "12-3456789" : "Registration / charter number"} />
          </div>
          <button type="button" className="btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        {notice && <p className="mt-1 text-xs text-emerald-700">{notice}</p>}
      </div>

      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          2. Supporting document {state.document_count > 0 && <span className="text-emerald-700">✓</span>}
        </div>
        <div className="mt-2">
          <AccountDocumentsPanel compact onChanged={load} />
        </div>
      </div>
    </div>
  );
}

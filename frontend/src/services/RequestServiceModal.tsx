import { useState } from "react";
import { api } from "../api";
import type { ServiceProviderListing } from "../types";

/** Request a service from one provider — category (scoped to what they've said they offer) +
 * a free-text message. Mirrors ConfirmDialog/RespondAmountModal's modal shape. */
export default function RequestServiceModal({
  provider, onSent, onCancel,
}: {
  provider: ServiceProviderListing;
  onSent: () => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.requestService(provider.account_id, { serviceCategory: category || undefined, message: message.trim() || undefined });
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">Request Service from {provider.name}</h3>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {provider.services_offered.length > 0 && (
          <div className="mt-4">
            <label className="label">Service</label>
            <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Select a service (optional)</option>
              {provider.services_offered.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div className="mt-4">
          <label className="label">Message</label>
          <textarea
            className="field" rows={4} value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder="What do you need help with?"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" disabled={submitting} onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary" disabled={submitting} onClick={submit}>
            {submitting ? "Sending…" : "Send Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { api } from "./api";
import type { TaxonomyTermType } from "./types";

const TYPE_LABELS: Record<TaxonomyTermType, string> = {
  attribute: "attribute", practice: "practice", certification: "certification", data_requirement: "data requirement",
  service_category: "service category",
};

/** "Don't see an attribute you need?" — lets a user propose a new term right where they're
 * picking one, rather than being stuck with the fixed superadmin-managed vocabulary. Notifies
 * every superadmin; see backend/attribute_requests_routes.py and
 * migrations/0027_attribute_requests_and_data_requirements.sql. Rendered at the bottom of every
 * ChipMultiSelect that picks a taxonomy term. */
export default function AttributeRequestLink({ type }: { type: TaxonomyTermType }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.requestAttribute(type, name.trim(), description.trim());
      setDone(true);
      setOpen(false);
      setName("");
      setDescription("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return <p className="mt-2 text-xs text-emerald-700">Thanks — a marketplace admin will review your request.</p>;
  }

  if (!open) {
    return (
      <button type="button" className="mt-2 text-xs font-medium text-brand-green hover:underline" onClick={() => setOpen(true)}>
        Don&rsquo;t see a {TYPE_LABELS[type]} you need?
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-brand-edge p-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <input
        className="field" placeholder={`${TYPE_LABELS[type]} name`}
        value={name} onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className="field" rows={2} placeholder="Description (optional)"
        value={description} onChange={(e) => setDescription(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost !py-1 !px-2 text-xs" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="button" className="btn-primary !py-1 !px-2 text-xs" disabled={busy || !name.trim()} onClick={submit}>
          {busy ? "Sending…" : "Request"}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api";
import { EmptyState, Spinner } from "../ui";
import type { AttributeRequest, TaxonomyTermType } from "../types";

const TYPE_OPTIONS: TaxonomyTermType[] = ["attribute", "practice", "certification", "data_requirement"];

function normalizeType(raw: string): TaxonomyTermType {
  const lower = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return (TYPE_OPTIONS as string[]).includes(lower) ? (lower as TaxonomyTermType) : "attribute";
}

/** A user's free-text "don't see a term you need?" submission (see
 * ../AttributeRequestLink.tsx) — the requester's own `type` is unvalidated, so "Add to
 * taxonomy" lets the admin correct it before it becomes a real taxonomy_terms row. See
 * backend/attribute_requests_routes.py. */
export default function AttributeRequestsTable() {
  const [requests, setRequests] = useState<AttributeRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [type, setType] = useState<TaxonomyTermType>("attribute");
  const [name, setName] = useState("");
  const [definition, setDefinition] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => api.adminAttributeRequests().then((r) => setRequests(r.requests)).catch(() => setRequests([]));
  useEffect(() => { load(); }, []);

  const startAdd = (r: AttributeRequest) => {
    setAddingId(r.id);
    setType(normalizeType(r.type));
    setName(r.name);
    setDefinition(r.description || "");
    setError(null);
  };

  const confirmAdd = async (r: AttributeRequest) => {
    setBusyId(r.id);
    setError(null);
    try {
      await api.adminCreateTaxonomyTerm(type, name.trim(), definition.trim());
      await api.adminMarkAttributeRequestAdded(r.id);
      setAddingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (r: AttributeRequest) => {
    setBusyId(r.id);
    setError(null);
    try {
      await api.adminDismissAttributeRequest(r.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  if (!requests) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {requests.length === 0 ? (
        <EmptyState title="No pending attribute requests" hint="A user's “Don't see an attribute you need?” submission shows up here until an admin adds it to the taxonomy or dismisses it." />
      ) : (
        requests.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-slate-900">
                  &ldquo;{r.name}&rdquo; <span className="text-xs font-normal uppercase tracking-wide text-slate-400">({r.type})</span>
                </div>
                {r.description && <div className="mt-0.5 text-sm text-slate-600">{r.description}</div>}
                <div className="mt-1 text-xs text-slate-400">
                  Requested by {r.requested_by_name || "someone"} on {new Date(r.created_at).toLocaleDateString()}
                </div>
              </div>
              {addingId !== r.id && (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="btn-primary !py-1.5 !px-3 text-xs"
                    disabled={busyId === r.id}
                    onClick={() => startAdd(r)}
                  >
                    Add to taxonomy
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !py-1.5 !px-3 text-xs"
                    disabled={busyId === r.id}
                    onClick={() => dismiss(r)}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>

            {addingId === r.id && (
              <div className="mt-3 space-y-2 border-t border-brand-edge pt-3">
                <div className="flex gap-2">
                  <select className="field" value={type} onChange={(e) => setType(e.target.value as TaxonomyTermType)}>
                    {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select>
                  <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <textarea className="field" rows={2} value={definition} onChange={(e) => setDefinition(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setAddingId(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary !py-1.5 !px-3 text-xs"
                    disabled={busyId === r.id || !name.trim()}
                    onClick={() => confirmAdd(r)}
                  >
                    {busyId === r.id ? "Adding…" : "Confirm"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

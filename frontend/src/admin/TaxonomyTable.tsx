import { useEffect, useState } from "react";
import { api } from "../api";
import { Spinner } from "../ui";
import type { AttributeSegment, TaxonomyTerm, TaxonomyTermType } from "../types";

const SEGMENTS: { id: AttributeSegment; label: string }[] = [
  { id: "sustainability", label: "Sustainability" },
  { id: "specialty", label: "Specialty" },
];

const SECTIONS: { type: TaxonomyTermType; label: string; hint: string }[] = [
  { type: "attribute", label: "Attributes", hint: "Sustainability/specialty attributes on offers, and buyers' required attributes." },
  { type: "practice", label: "Practices", hint: "Conservation practices on offers and growers' farm profiles, and operators' verified practices." },
  { type: "certification", label: "Certifications", hint: "Certifications on offers and buyers' required certifications." },
  { type: "data_requirement", label: "Data Requirements", hint: "A buyer's specific data ask on a bid (e.g. \"John Deere User ID\", \"GeoJSON format\") — not yet used in matching." },
  { type: "service_category", label: "Service Categories", hint: "Services a Service Provider can offer (logistics, inspection, financing, etc.) — shown on their profile and the provider directory." },
];

/** Superadmin CRUD for the vocabularies every offer/bid/requirements/service-provider picker in
 * the app draws from. Each term's definition shows as a hover tooltip wherever it's picked (see
 * useTaxonomyTerms + ChipMultiSelect's `titles` prop). */
export default function TaxonomyTable() {
  const [terms, setTerms] = useState<TaxonomyTerm[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.taxonomy().then((r) => setTerms(r.terms)).catch(() => setTerms([]));
  useEffect(() => { load(); }, []);

  if (!terms) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {SECTIONS.map((section) => (
        <TaxonomySection
          key={section.type}
          section={section}
          terms={terms.filter((t) => t.type === section.type)}
          onChanged={load}
          onError={setError}
        />
      ))}
    </div>
  );
}

function TaxonomySection({
  section, terms, onChanged, onError,
}: {
  section: { type: TaxonomyTermType; label: string; hint: string };
  terms: TaxonomyTerm[];
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  return (
    <div className="card p-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{section.label}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{section.hint}</p>
      </div>

      {section.type === "attribute" ? (
        <div className="mt-4 space-y-5">
          {SEGMENTS.map((seg) => (
            <TaxonomyGroup
              key={seg.id}
              heading={`${seg.label} Attributes`}
              type="attribute"
              segment={seg.id}
              terms={terms.filter((t) => t.segment === seg.id)}
              onChanged={onChanged}
              onError={onError}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <TaxonomyGroup type={section.type} terms={terms} onChanged={onChanged} onError={onError} />
        </div>
      )}
    </div>
  );
}

function TaxonomyGroup({
  heading, type, segment, terms, onChanged, onError,
}: {
  heading?: string;
  type: TaxonomyTermType;
  segment?: AttributeSegment;
  terms: TaxonomyTerm[];
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDefinition, setNewDefinition] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const create = async () => {
    if (!newLabel.trim()) return;
    setBusyId("__new__");
    onError("");
    try {
      await api.adminCreateTaxonomyTerm(type, newLabel.trim(), newDefinition.trim(), segment);
      setNewLabel("");
      setNewDefinition("");
      setAdding(false);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (term: TaxonomyTerm) => {
    if (!confirm(`Remove "${term.label}"? Listings that already picked it keep the value, but it won't be pickable anymore.`)) return;
    setBusyId(term.id);
    onError("");
    try {
      await api.adminDeleteTaxonomyTerm(term.id);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        {heading ? <h3 className="text-sm font-semibold text-slate-800">{heading}</h3> : <span />}
        <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Add Term"}
        </button>
      </div>

      {adding && (
        <div className="mt-3 space-y-2 rounded-lg border border-brand-edge p-3">
          <input className="field" placeholder="Term (e.g. Regenerative Agriculture)"
            value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <textarea className="field" rows={2} placeholder="Definition (shown as a hover tooltip)"
            value={newDefinition} onChange={(e) => setNewDefinition(e.target.value)} />
          <div className="flex justify-end">
            <button type="button" className="btn-primary !py-1.5 !px-3 text-xs" disabled={busyId === "__new__" || !newLabel.trim()} onClick={create}>
              {busyId === "__new__" ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 divide-y divide-brand-edge">
        {terms.length === 0 && <p className="py-2 text-sm text-slate-400">No terms yet.</p>}
        {terms.map((t) => (
          <TermRow key={t.id} term={t} busy={busyId === t.id} onRemove={() => remove(t)} onChanged={onChanged} onError={onError} />
        ))}
      </div>
    </div>
  );
}

function TermRow({
  term, busy, onRemove, onChanged, onError,
}: {
  term: TaxonomyTerm;
  busy: boolean;
  onRemove: () => void;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(term.label);
  const [definition, setDefinition] = useState(term.definition ?? "");
  const [segment, setSegment] = useState<AttributeSegment>(term.segment ?? "sustainability");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    onError("");
    try {
      await api.adminUpdateTaxonomyTerm(term.id, {
        label: label.trim(), definition: definition.trim(),
        ...(term.type === "attribute" ? { segment } : {}),
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-2 py-3">
        <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} />
        <textarea className="field" rows={2} value={definition} onChange={(e) => setDefinition(e.target.value)} />
        {term.type === "attribute" && (
          <div className="flex gap-4">
            {SEGMENTS.map((seg) => (
              <label key={seg.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="radio" name={`segment-${term.id}`} checked={segment === seg.id} onChange={() => setSegment(seg.id)} />
                {seg.label}
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost !py-1 !px-2 text-xs" onClick={() => setEditing(false)}>Cancel</button>
          <button type="button" className="btn-primary !py-1 !px-2 text-xs" disabled={saving || !label.trim()} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div>
        <div className="text-sm font-medium text-slate-800">{term.label}</div>
        {term.definition && <div className="mt-0.5 text-xs text-slate-500">{term.definition}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button type="button" className="text-xs font-medium text-brand-green hover:underline" onClick={() => setEditing(true)}>Edit</button>
        <button type="button" className="text-xs text-slate-500 hover:text-red-600" disabled={busy} onClick={onRemove}>
          {busy ? "…" : "Remove"}
        </button>
      </div>
    </div>
  );
}

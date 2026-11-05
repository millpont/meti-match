import { useState } from "react";
import { api } from "../api";
import { ChipMultiSelect, NumberInput } from "../ui";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import type { NewGrowerDraft } from "../types";

const EMPTY: NewGrowerDraft = {
  farm_name: "", contact_name: "", email: "", phone: "", farms_count: "", acres_enrolled: "", primary_practices: [],
};

/** Register a grower who isn't on the platform yet, acting on their behalf. This creates a real
 * grower account (so it can be listed for and aggregated straight away) and enrolls it in this
 * program immediately — the grower takes it over later by logging in with the same email. */
export default function RegisterGrowerForm({ onCreated }: { onCreated: (notice: string) => void }) {
  const [draft, setDraft] = useState<NewGrowerDraft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const practices = useTaxonomyTerms("practice");

  const set = <K extends keyof NewGrowerDraft>(k: K, v: NewGrowerDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    if (!draft.farm_name.trim()) return setError("Farm name is required");
    if (!draft.email.trim()) return setError("Email is required — it's how the grower claims this account");
    setError(null);
    setSubmitting(true);
    try {
      await api.createGrowerAccount(draft);
      onCreated(
        `${draft.farm_name.trim()} is registered and enrolled in your program. They can take over the account any time by logging in with ${draft.email.trim()}.`,
      );
      setDraft(EMPTY);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-slate-900">Register a new grower</h2>
      <p className="mt-0.5 text-sm text-slate-600">
        For a grower who isn't on the platform yet. You set the account up on their behalf and they're
        enrolled in your program right away.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Farm Name *</label>
          <input className="field" value={draft.farm_name} onChange={(e) => set("farm_name", e.target.value)} />
        </div>
        <div>
          <label className="label">Grower Contact Name</label>
          <input className="field" value={draft.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
        </div>
        <div>
          <label className="label">Email *</label>
          <input type="email" className="field" value={draft.email} onChange={(e) => set("email", e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">The grower logs in with this email to claim their account.</p>
        </div>
        <div>
          <label className="label">Phone</label>
          <input type="tel" className="field" value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div>
          <label className="label">Farms</label>
          <NumberInput value={draft.farms_count} onChange={(v) => set("farms_count", v)} />
        </div>
        <div>
          <label className="label">Acres Enrolled</label>
          <NumberInput value={draft.acres_enrolled} onChange={(v) => set("acres_enrolled", v)} />
        </div>
      </div>
      <div className="mt-4">
        <label className="label">Primary Practices</label>
        <ChipMultiSelect options={practices.labels} titles={practices.titles} selected={draft.primary_practices}
          onChange={(v) => set("primary_practices", v)} />
      </div>
      <div className="mt-5 flex justify-end">
        <button type="button" className="btn-primary" disabled={submitting} onClick={submit}>
          {submitting ? "Registering…" : "Register & Enroll Grower"}
        </button>
      </div>
    </div>
  );
}

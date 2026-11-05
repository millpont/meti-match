import { useEffect, useState } from "react";
import { api } from "../api";
import type { AccountRole, CompanyOption } from "../types";
import { orgNoun } from "./constants";

const ROLE_LABELS: Record<string, string> = {
  grower: "Grower", program_operator: "Program Operator",
  international_buyer: "International Buyer", service_provider: "Service Provider",
};

/** The "join an existing company" half of registration, for a role already picked one step
 * earlier (see Onboarding.tsx) — search by company name among companies that already hold that
 * role, and ask that company's admin (or a superadmin) to approve. See
 * onboarding_routes.py's /api/onboarding/companies?role= + /api/onboarding/join. */
export default function JoinCompanyForm({
  role, onSubmitted, onBack,
}: {
  role: AccountRole;
  onSubmitted: () => void;
  onBack: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CompanyOption[]>([]);
  const [allCompanies, setAllCompanies] = useState<CompanyOption[]>([]);
  const [selected, setSelected] = useState<CompanyOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noun = orgNoun(role);
  const Noun = noun === "program" ? "Program" : "Company";

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      api.searchCompanies(q.trim(), role).then((r) => setResults(r.companies)).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [q, role]);

  // Populates the "or choose from a list" dropdown — every company already holding this role,
  // for someone who'd rather browse than type a search.
  useEffect(() => {
    api.searchCompanies("", role).then((r) => setAllCompanies(r.companies)).catch(() => setAllCompanies([]));
  }, [role]);

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.requestToJoinCompany(selected.id, role);
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="text-xl font-bold text-slate-900">Join an existing {noun}</h1>
      <p className="mt-1 text-sm text-slate-600">
        Find your {noun} among those already registered as {ROLE_LABELS[role] ?? role}, and ask
        its admin to approve your access.
      </p>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {!selected ? (
        <div className="mt-6">
          <label className="label">{Noun} name</label>
          <input
            className="field" autoFocus placeholder="Start typing…"
            value={q} onChange={(e) => setQ(e.target.value)}
          />
          {results.length > 0 && (
            <div className="mt-2 divide-y divide-brand-edge overflow-hidden rounded-lg border border-brand-edge">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="block w-full px-3 py-2.5 text-left text-sm hover:bg-brand-bg"
                  onClick={() => setSelected(c)}
                >
                  <div className="font-medium text-slate-800">{c.name}</div>
                </button>
              ))}
            </div>
          )}
          {q.trim().length >= 2 && results.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">
              No {noun === "program" ? "programs" : "companies"} found registered as {ROLE_LABELS[role] ?? role}.
            </p>
          )}

          {allCompanies.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
                <span className="h-px flex-1 bg-brand-edge" />
                or choose from a list
                <span className="h-px flex-1 bg-brand-edge" />
              </div>
              <select
                className="field"
                value=""
                onChange={(e) => {
                  const c = allCompanies.find((x) => x.id === e.target.value);
                  if (c) setSelected(c);
                }}
              >
                <option value="" disabled>Select a {noun}…</option>
                {allCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-brand-edge bg-brand-bg px-3 py-2 text-sm">
          <span className="font-medium text-slate-800">{selected.name}</span>
          <button
            type="button"
            className="ml-3 text-xs font-medium text-brand-green hover:underline"
            onClick={() => setSelected(null)}
          >
            Change
          </button>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button type="button" className="btn-ghost" onClick={onBack} disabled={busy}>
          Back
        </button>
        {selected && (
          <button type="button" className="btn-primary px-6" disabled={busy} onClick={submit}>
            {busy ? "Sending…" : "Request to join"}
          </button>
        )}
      </div>
    </div>
  );
}

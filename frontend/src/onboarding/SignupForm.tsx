import { useState } from "react";
import type { AccountSetupDraft } from "../types";
import { orgNoun } from "./constants";

/** Step 1 of account setup, shared across every role: name, company (or, for a Program
 * Operator, program) name, phone, email. Deliberately nothing more — the business identifier and
 * company documents that used to be asked here put people off before they'd seen the platform, so
 * they moved to the Profile tab and are only required to transact (see
 * profile/BusinessVerificationPanel.tsx). */
export default function SignupForm({
  initial, role, emailVerified, onNext, onBack, submitting, error: submitError,
}: {
  initial: AccountSetupDraft;
  role: string;
  /** From the Auth0 login — false means a validation email is waiting in their inbox. */
  emailVerified?: boolean;
  onNext: (draft: AccountSetupDraft) => void;
  onBack?: () => void;
  /** Set while `onNext`'s account-creation call is in flight — disables the form. */
  submitting?: boolean;
  /** Server-side error from that call, shown alongside this form's own validation errors. */
  error?: string | null;
}) {
  const [draft, setDraft] = useState<AccountSetupDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const noun = orgNoun(role);
  const orgLabel = noun === "program" ? "Program Name" : "Company / Organization Name";

  const set = <K extends keyof AccountSetupDraft>(k: K, v: AccountSetupDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const next = () => {
    if (!draft.name.trim()) return setError("Your name is required");
    if (!draft.company.trim()) return setError(`${orgLabel} is required`);
    if (!draft.phone.trim()) return setError("Phone number is required");
    if (!draft.email.trim()) return setError("Email is required");
    setError(null);
    onNext(draft);
  };

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="text-xl font-bold text-slate-900">Create your account</h1>
      <p className="mt-1 text-sm text-slate-600">A few details, then you're in.</p>
      {emailVerified === false && (
        <p className="mt-3 rounded-lg bg-brand-bg px-3 py-2 text-sm text-slate-600">
          You'll receive an email to validate your account — please click the link in it to confirm your
          address.
        </p>
      )}

      {(error || submitError) && <p className="mt-4 text-sm text-red-600">{error || submitError}</p>}

      <div className="mt-6 space-y-4">
        <div>
          <label className="label">Your Name *</label>
          <input className="field" value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="label">{orgLabel} *</label>
          <input className="field" value={draft.company} onChange={(e) => set("company", e.target.value)} />
        </div>
        <div>
          <label className="label">Phone Number *</label>
          <input type="tel" className="field" value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div>
          <label className="label">Email *</label>
          <input type="email" className="field" value={draft.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        {role === "service_provider" && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input type="checkbox" checked={!!draft.is_trader} onChange={(e) => set("is_trader", e.target.checked)} />
              I'm a Trader — I contract on behalf of international buyers
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Leave this off if you only provide technical services (inspection, logistics, financing…). You
              can change it later in My Profile.
            </p>
          </div>
        )}
        <p className="text-xs text-slate-500">
          Once you're in, you can explore the marketplace right away. Before you publish or respond to a
          listing, you'll be asked to add a business identifier and a supporting document in My Profile.
        </p>
      </div>

      <div className="mt-8 flex items-center justify-between">
        {onBack ? (
          <button type="button" className="btn-ghost" onClick={onBack} disabled={submitting}>Back</button>
        ) : <span />}
        <button type="button" className="btn-primary px-6" disabled={submitting} onClick={next}>
          {submitting ? "Setting up…" : "Continue"}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api";
import type { AccountRole, AccountSetupDraft, JoinRequest } from "../types";
import SignupForm from "./SignupForm";
import { orgNoun } from "./constants";
import RolePicker from "./RolePicker";
import JoinCompanyForm from "./JoinCompanyForm";
import JoinRequestStatus from "./JoinRequestStatus";

type JoinableRole = Exclude<AccountRole, "admin">;
type Mode = "create" | "join" | null;

const ONBOARD_FN: Record<JoinableRole, (draft: AccountSetupDraft) => ReturnType<typeof api.onboardGrower>> = {
  grower: api.onboardGrower,
  program_operator: api.onboardOperator,
  international_buyer: api.onboardBuyer,
  service_provider: api.onboardServiceProvider,
};

const POLL_MS = 8_000;

/** Shown to an authenticated user with no account yet. Role is picked FIRST, then the user
 * either creates a brand-new company (shared contact-info step, account created immediately
 * under the already-chosen role) or asks to join a company that already holds that role —
 * which needs that company's admin (or a superadmin) to approve before landing in the app (see
 * migrations/0024_company_join_requests.sql and onboarding_routes.py). Every step has a way
 * back to the previous one. */
export default function Onboarding({
  onDone, defaultEmail, emailVerified, pendingJoinRequest, claimableAccount,
}: {
  onDone: () => void;
  defaultEmail?: string;
  emailVerified?: boolean;
  pendingJoinRequest?: JoinRequest | null;
  /** A grower account a program operator already registered for this email — offered first. */
  claimableAccount?: { id: string; name: string | null; operator_name: string | null } | null;
}) {
  const [role, setRole] = useState<JoinableRole | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedRequestId, setDismissedRequestId] = useState<string | null>(null);
  const [claimDismissed, setClaimDismissed] = useState(false);

  const activeRequest = pendingJoinRequest && pendingJoinRequest.id !== dismissedRequestId ? pendingJoinRequest : null;

  // While a request is pending, poll /api/me so an admin's approval (or decline) elsewhere is
  // reflected here without the user needing to refresh or log in again.
  useEffect(() => {
    if (activeRequest?.status !== "pending") return;
    const interval = setInterval(onDone, POLL_MS);
    return () => clearInterval(interval);
  }, [activeRequest?.status, onDone]);

  if (activeRequest) {
    return (
      <JoinRequestStatus
        request={activeRequest}
        onStartOver={() => { setDismissedRequestId(activeRequest.id); setRole(null); setMode(null); }}
      />
    );
  }

  if (claimableAccount && !claimDismissed && !role) {
    const claim = async () => {
      setSubmitting(true);
      setError(null);
      try {
        await api.claimAccount(claimableAccount.id);
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setSubmitting(false);
      }
    };
    return (
      <div className="mx-auto max-w-md px-6 py-12 text-center">
        <h1 className="text-xl font-bold text-slate-900">Your farm is already set up</h1>
        <p className="mt-2 text-sm text-slate-600">
          {claimableAccount.operator_name || "Your program operator"} registered{" "}
          <span className="font-medium">{claimableAccount.name || "your farm"}</span> on METI
          Match for you, and enrolled it in their program. Claim it to take over the account —
          your listings, production data and enrollment come with it.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex flex-col items-center gap-2">
          <button type="button" className="btn-primary px-6" disabled={submitting} onClick={claim}>
            {submitting ? "Claiming…" : "Claim my farm account"}
          </button>
          <button type="button" className="btn-ghost text-xs" disabled={submitting} onClick={() => setClaimDismissed(true)}>
            This isn't me — create a new account instead
          </button>
        </div>
      </div>
    );
  }

  if (!role) {
    return <RolePicker onSelect={setRole} />;
  }

  if (mode === "join") {
    return <JoinCompanyForm role={role} onSubmitted={onDone} onBack={() => setMode(null)} />;
  }

  if (mode === "create") {
    const createAccount = async (contact: AccountSetupDraft) => {
      setSubmitting(true);
      setError(null);
      try {
        await ONBOARD_FN[role](contact);
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setSubmitting(false);
      }
    };
    return (
      <SignupForm
        initial={{ name: "", company: "", phone: "", email: defaultEmail || "" }}
        role={role}
        emailVerified={emailVerified}
        onNext={createAccount}
        onBack={() => setMode(null)}
        submitting={submitting}
        error={error}
      />
    );
  }

  const noun = orgNoun(role);
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Join METI Match</h1>
        <p className="mt-2 text-slate-600">Is your {noun} already set up on the platform?</p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green"
          onClick={() => setMode("create")}
        >
          <span className="text-sm font-semibold text-slate-900">Create a new {noun}</span>
          <span className="text-xs text-slate-600">Your {noun} isn&rsquo;t on the platform yet — set it up now.</span>
        </button>
        <button
          type="button"
          className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green"
          onClick={() => setMode("join")}
        >
          <span className="text-sm font-semibold text-slate-900">Join an existing {noun}</span>
          <span className="text-xs text-slate-600">A colleague already registered your {noun} — ask to join it.</span>
        </button>
      </div>
      <div className="mt-6 flex justify-center">
        <button type="button" className="btn-ghost" onClick={() => setRole(null)}>Back</button>
      </div>
    </div>
  );
}

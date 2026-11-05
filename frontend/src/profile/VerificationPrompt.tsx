import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { VERIFICATION_REQUIRED_EVENT } from "../api";
import { useAppNav } from "../AppNavContext";
import { VERIFICATION_CHANGED_EVENT } from "./BusinessVerificationPanel";

interface VerificationValue {
  /** True once the account may transact (or the requirement is off). */
  verified: boolean;
  /** Call before a gated action: returns true to proceed, or opens the popup and returns false. */
  requireVerified: (action: string) => boolean;
}

const VerificationContext = createContext<VerificationValue>({ verified: true, requireVerified: () => true });

export const useVerification = () => useContext(VerificationContext);

/** Owns the "complete your business verification" popup. Opens either up front (a form calls
 * requireVerified before publishing) or after the fact (any API call refused with the
 * business_verification_required code — see api.ts's VERIFICATION_REQUIRED_EVENT), and points
 * the user at the Profile tab, where the identifier + documents live. */
export function VerificationProvider({ verified, onChanged, children }: {
  verified: boolean;
  /** Called when the Profile panel reports a status change — App refetches /api/me. */
  onChanged: () => void;
  children: ReactNode;
}) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const { goToDashboardTab } = useAppNav();

  useEffect(() => {
    const onRequired = () => setPrompt("transact on the marketplace");
    window.addEventListener(VERIFICATION_REQUIRED_EVENT, onRequired);
    window.addEventListener(VERIFICATION_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(VERIFICATION_REQUIRED_EVENT, onRequired);
      window.removeEventListener(VERIFICATION_CHANGED_EVENT, onChanged);
    };
  }, [onChanged]);

  const requireVerified = useCallback((action: string) => {
    if (verified) return true;
    setPrompt(action);
    return false;
  }, [verified]);

  const value = useMemo(() => ({ verified, requireVerified }), [verified, requireVerified]);

  return (
    <VerificationContext.Provider value={value}>
      {children}
      {prompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Complete your business verification</h3>
            <p className="mt-2 text-sm text-slate-600">
              Before you can {prompt}, add one business identifier (such as your EIN or state registration
              number) and at least one supporting company document in My Profile. It only takes a minute —
              and you can keep saving drafts in the meantime.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setPrompt(null)}>Not now</button>
              <button type="button" className="btn-primary" onClick={() => {
                setPrompt(null);
                goToDashboardTab("profile");
                setTimeout(() => document.getElementById("business-verification")?.scrollIntoView({ behavior: "smooth" }), 50);
              }}>
                Go to My Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </VerificationContext.Provider>
  );
}

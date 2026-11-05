import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { AccountRole, Me } from "./types";

const ROLE_LABELS: Record<string, string> = {
  grower: "Grower", program_operator: "Program Operator",
  international_buyer: "Buyer", service_provider: "Service Provider",
};

// Roles an account can add to itself / switch into — mirrors onboarding_routes.py's
// ADDABLE_ROLES. service_provider is deliberately absent: it's a singular role, registered as its
// own account, never toggled into (see migrations/0055_service_provider_singular_role.sql).
const ADDABLE_ROLES: AccountRole[] = ["grower", "program_operator", "international_buyer"];

/** A company can hold more than one role at once (e.g. a Grower that also buys internationally —
 * see migrations/0022_multi_role_accounts.sql). This lets the current user switch which role is
 * ACTIVE for this session (which dashboard renders), and add an extra role their account doesn't
 * hold yet. Service Provider is excluded from both lists — switching into it only ever changed
 * the session role, leaving the profile editor, provider directory and service-request lookup
 * (all of which resolve by accounts.role) behind. */
export default function RoleSwitcher({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Held roles, minus service_provider — an account that still holds it from before can't switch
  // into it either (the server rejects that too, see onboarding_routes.py's switch_role).
  const roles: AccountRole[] = (me.roles && me.roles.length > 0 ? me.roles : me.role ? [me.role] : [])
    .filter((r) => r !== "service_provider");
  const addableRoles = ADDABLE_ROLES.filter((r) => !roles.includes(r));

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setAdding(false); }
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  const switchTo = async (role: AccountRole) => {
    if (role === me.role) return setOpen(false);
    setBusy(true);
    setError(null);
    try {
      await api.switchRole(role);
      setOpen(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const addRole = async (role: AccountRole) => {
    setBusy(true);
    setError(null);
    try {
      await api.addRole(role);
      setOpen(false);
      setAdding(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10"
      >
        {me.role ? ROLE_LABELS[me.role] ?? me.role : "Role"} {roles.length > 1 || addableRoles.length > 0 ? "▾" : ""}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-lg border border-brand-edge bg-white shadow-lg">
          {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}
          {!adding ? (
            <>
              {roles.length > 1 && (
                <div className="border-b border-brand-edge p-1.5">
                  <div className="px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Switch role</div>
                  {roles.map((r) => (
                    <button
                      key={r}
                      type="button"
                      disabled={busy || r === me.role}
                      onClick={() => switchTo(r)}
                      className={`block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-brand-bg ${
                        r === me.role ? "font-semibold text-brand-green" : "text-slate-700"
                      }`}
                    >
                      {ROLE_LABELS[r] ?? r}{r === me.role ? " (active)" : ""}
                    </button>
                  ))}
                </div>
              )}
              {addableRoles.length > 0 && (
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm font-medium text-brand-green hover:bg-brand-bg"
                  onClick={() => setAdding(true)}
                >
                  + Add a Role
                </button>
              )}
            </>
          ) : (
            <div className="p-1.5">
              <div className="px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Add a role</div>
              {addableRoles.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={busy}
                  onClick={() => addRole(r)}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-brand-bg"
                >
                  {ROLE_LABELS[r] ?? r}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

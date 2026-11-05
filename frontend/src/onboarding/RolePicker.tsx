import { IconCircle } from "../ui";
import { GavelIcon, GlobeIcon, UsersIcon, WheatIcon } from "../icons";
import type { AccountRole } from "../types";
import type { ComponentType, SVGProps } from "react";

type JoinableRole = Exclude<AccountRole, "admin">;

const ROLES: {
  id: JoinableRole; label: string; blurb: string; icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone: "green" | "gold"; disabled?: boolean;
}[] = [
  { id: "grower", label: "Grower", blurb: "Sell your grain, explore programs, and grow your business.", icon: WheatIcon, tone: "green" },
  { id: "program_operator", label: "Program Operator", blurb: "Aggregate grain from enrolled growers and offer your own production.", icon: UsersIcon, tone: "gold" },
  { id: "international_buyer", label: "International Buyer", blurb: "Source high-quality grain and build reliable partnerships.", icon: GlobeIcon, tone: "green" },
  { id: "service_provider", label: "Service Provider", blurb: "Offer technical services (inspection, logistics, financing…) — or trade on behalf of international buyers.", icon: GavelIcon, tone: "gold" },
];

/** Step 1 of registration — pick a role before deciding whether to create a new company or
 * join an existing one that already holds it (see Onboarding.tsx). Picking a role here is just
 * a client-side choice, not a submission — nothing is created yet. */
export default function RolePicker({
  onSelect,
}: {
  onSelect: (role: JoinableRole) => void;
}) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Join METI Match</h1>
        <p className="mt-2 text-slate-600">Select your role to get started</p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={r.disabled}
            onClick={() => onSelect(r.id)}
            className="card group flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-brand-edge"
          >
            <IconCircle tone={r.tone}><r.icon /></IconCircle>
            <span className="mt-1 text-sm font-semibold text-slate-900">{r.label}</span>
            <span className="text-xs text-slate-600">{r.blurb}</span>
            <span className="mt-auto text-xs font-medium text-brand-gold group-disabled:text-slate-500">
              {r.disabled ? "Coming soon" : "Select →"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

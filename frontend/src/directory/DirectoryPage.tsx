import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, EmptyState, Spinner } from "../ui";
import ProfileLink from "../profile/ProfileLink";
import type { AccountRole, DirectoryEntry } from "../types";

const ROLE_TABS: { role: AccountRole; label: string }[] = [
  { role: "grower", label: "Growers" },
  { role: "international_buyer", label: "Buyers" },
  { role: "program_operator", label: "Program Operators" },
  { role: "service_provider", label: "Service Providers" },
];

const ROLE_LABELS: Record<string, string> = {
  grower: "Grower",
  international_buyer: "Buyer",
  program_operator: "Program Operator",
  service_provider: "Service Provider",
};

/** Marketplace Directory — who's on the platform, by role, with what they're currently offering.
 * A top-level page next to the Marketplace (see App.tsx's topNav), not a dashboard tab.
 *
 * Carries no contact information by design (the API doesn't return any) — reaching someone goes
 * through their profile. "View listings" deep-links into the Marketplace pre-filtered to just
 * that organization via the Organization filter. */
export default function DirectoryPage({
  onViewOrganizationListings,
}: {
  /** Omitted for accounts that can't open the Marketplace (technical-services providers). */
  onViewOrganizationListings?: (accountId: string) => void;
}) {
  const [role, setRole] = useState<AccountRole>("grower");
  const [hasListingsOnly, setHasListingsOnly] = useState(false);
  const [entries, setEntries] = useState<DirectoryEntry[] | null>(null);

  useEffect(() => {
    setEntries(null);
    api.directory([role], hasListingsOnly)
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
  }, [role, hasListingsOnly]);

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">Directory</h1>
      <p className="mt-1 text-sm text-slate-600">
        Everyone on the marketplace, by category — with what they currently have listed.
      </p>

      <div className="mt-5 flex gap-1 border-b border-brand-edge">
        {ROLE_TABS.map((t) => (
          <button
            key={t.role}
            type="button"
            onClick={() => setRole(t.role)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              role === t.role ? "text-brand-green" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
            {role === t.role && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-green" />}
          </button>
        ))}
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={hasListingsOnly} onChange={(e) => setHasListingsOnly(e.target.checked)} />
        Has listings only
      </label>

      <div className="mt-4">
        {entries == null ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : entries.length === 0 ? (
          <EmptyState
            title="Nobody here yet"
            hint={hasListingsOnly ? "Nobody in this category has active listings right now." : "Check back soon."}
          />
        ) : (
          <div className="space-y-3">
            {entries.map((e) => {
              const name = e.display_name || e.name || "Unnamed organization";
              return (
                <div key={e.account_id} className="card flex flex-wrap items-start gap-4 p-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-brand-bg">
                    {e.photo_url && <img src={e.photo_url} alt={name} className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{name}</span>
                      <Badge tone="slate">{ROLE_LABELS[e.role] ?? e.role}</Badge>
                    </div>
                    {e.bio && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{e.bio}</p>}
                    <div className="mt-2">
                      <ProfileLink accountId={e.account_id} name={name} />
                    </div>
                  </div>
                  <div className="min-w-[150px] text-xs">
                    <div className="text-slate-500">Active Listings</div>
                    <div className="mt-0.5 text-sm text-slate-800">{e.listing_summary}</div>
                    {e.active_listing_count > 0 && onViewOrganizationListings && (
                      <button
                        type="button"
                        className="mt-1 text-xs font-medium text-brand-green hover:underline"
                        onClick={() => onViewOrganizationListings(e.account_id)}
                      >
                        View their listings
                      </button>
                    )}
                  </div>
                  <div className="min-w-[110px] text-xs">
                    <div className="text-slate-500">Completed</div>
                    <div className="text-sm text-slate-800">{e.reputation.completed_contracts} agreements</div>
                    {e.reputation.on_time_rate != null && (
                      <div className="mt-1 text-slate-500">{Math.round(e.reputation.on_time_rate * 100)}% on time</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

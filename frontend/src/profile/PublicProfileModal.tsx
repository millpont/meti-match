import { useEffect, useState } from "react";
import { api } from "../api";
import { Spinner } from "../ui";
import type { PublicProfile } from "../types";
import { useProfilePage } from "./ProfilePageContext";

const ROLE_LABELS: Record<string, string> = {
  grower: "Grower", program_operator: "Program Operator",
  international_buyer: "International Buyer", service_provider: "Service Provider", admin: "Admin",
};

export default function PublicProfileModal({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { openProfile } = useProfilePage();

  const viewFullProfile = () => {
    openProfile(accountId);
    onClose();
  };

  useEffect(() => {
    setProfile(null);
    setError(null);
    api.publicProfile(accountId).then((r) => setProfile(r.profile)).catch((e) => setError(e instanceof Error ? e.message : "Something went wrong"));
  }, [accountId]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {error && (
          <>
            <p className="text-sm text-red-600">{error}</p>
            <div className="mt-4 flex justify-end">
              <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
            </div>
          </>
        )}
        {!error && !profile && <div className="flex justify-center py-8"><Spinner /></div>}
        {!error && profile && (
          <div>
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-brand-bg">
                {profile.photo_url && <img src={profile.photo_url} alt={profile.name} className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-slate-900">{profile.name}</div>
                <div className="text-xs text-slate-500">{ROLE_LABELS[profile.role] ?? profile.role}</div>
              </div>
            </div>

            {profile.bio && <p className="mt-4 text-sm text-slate-700">{profile.bio}</p>}

            <div className="mt-4 flex gap-6 text-sm">
              <div>
                <div className="text-lg font-bold text-slate-900">{profile.reputation.completed_contracts}</div>
                <div className="text-xs text-slate-500">Completed agreements</div>
              </div>
              {profile.reputation.on_time_rate != null && (
                <div>
                  <div className="text-lg font-bold text-slate-900">{Math.round(profile.reputation.on_time_rate * 100)}%</div>
                  <div className="text-xs text-slate-500">On-time rate</div>
                </div>
              )}
            </div>

            {(profile.website_url || profile.links.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-3">
                {profile.website_url && (
                  <a href={profile.website_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-green hover:underline">
                    Website
                  </a>
                )}
                {profile.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-green hover:underline">
                    {l.label}
                  </a>
                ))}
              </div>
            )}

            {profile.contact_visible && (profile.contact_name || profile.contact_phone || profile.contact_email) && (
              <div className="mt-4 border-t border-brand-edge pt-4 text-sm text-slate-700">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</div>
                {profile.contact_name && <div>{profile.contact_name}</div>}
                {profile.contact_phone && <div>{profile.contact_phone}</div>}
                {profile.contact_email && <div>{profile.contact_email}</div>}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
              <button type="button" className="btn-primary" onClick={viewFullProfile}>View Full Profile →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

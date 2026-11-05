import { useEffect, useState } from "react";
import { api } from "../api";
import { Spinner } from "../ui";
import type { PublicProfile } from "../types";

const ROLE_LABELS: Record<string, string> = {
  grower: "Grower", program_operator: "Program Operator",
  international_buyer: "Buyer", service_provider: "Service Provider", admin: "Admin",
};

/** The full profile page — more room than PublicProfileModal for a longer bio and a photo
 * gallery (e.g. of the farm itself, not just a single avatar). There's no router in this app, so
 * "navigating" here just means App.tsx swaps its main content — see ProfilePageContext.tsx. */
export default function PublicProfilePage({ accountId, onBack }: { accountId: string; onBack: () => void }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProfile(null);
    setError(null);
    api.publicProfile(accountId).then((r) => setProfile(r.profile)).catch((e) => setError(e instanceof Error ? e.message : "Something went wrong"));
  }, [accountId]);

  return (
    <div>
      <button type="button" className="mb-4 text-sm font-medium text-slate-500 hover:text-slate-700" onClick={onBack}>
        ← Back
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && !profile && <div className="flex justify-center py-12"><Spinner /></div>}

      {!error && profile && (
        <div className="space-y-6">
          <div className="card flex flex-wrap items-start gap-5 p-5">
            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-full bg-brand-bg">
              {profile.photo_url && <img src={profile.photo_url} alt={profile.name} className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-[200px] flex-1">
              <h1 className="text-xl font-bold text-slate-900">{profile.name}</h1>
              <div className="mt-0.5 text-sm text-slate-500">{ROLE_LABELS[profile.role] ?? profile.role}</div>
              {profile.bio && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{profile.bio}</p>}
              {(profile.website_url || profile.links.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-3">
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
            </div>
            <div className="flex gap-6 text-sm">
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
          </div>

          {profile.contact_visible && (profile.contact_name || profile.contact_phone || profile.contact_email) && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Contact</h2>
              <div className="mt-2 text-sm text-slate-700">
                {profile.contact_name && <div>{profile.contact_name}</div>}
                {profile.contact_phone && <div>{profile.contact_phone}</div>}
                {profile.contact_email && <div>{profile.contact_email}</div>}
              </div>
            </div>
          )}

          {profile.gallery_photos.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Photos</h2>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {profile.gallery_photos.map((p) => (
                  <div key={p.id}>
                    <div className="aspect-square overflow-hidden rounded-lg bg-brand-bg">
                      {p.url && <img src={p.url} alt={p.caption || profile.name} className="h-full w-full object-cover" />}
                    </div>
                    {p.caption && <p className="mt-1 text-xs text-slate-500">{p.caption}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

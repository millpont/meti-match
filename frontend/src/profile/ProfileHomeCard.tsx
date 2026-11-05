import { useEffect, useState } from "react";
import { api } from "../api";
import type { OwnProfile } from "../types";

/** Small "Your Profile" summary dropped into each dashboard's Home tab (Phase 9 item 54 —
 * "From Home page: Include Profile section") — a photo/bio snippet plus a jump to the full
 * Profile tab, not a duplicate editor. Renders a same-size skeleton while loading instead of
 * nothing, so it doesn't pop in late and shift the rest of the page down after it. Fetches in
 * "summary" mode — skips the gallery-photo lookup this card never shows, so an account with
 * several gallery photos doesn't pay for signed URLs it won't use here. */
export default function ProfileHomeCard({ onOpenProfile }: { onOpenProfile: () => void }) {
  const [profile, setProfile] = useState<OwnProfile | null>(null);

  useEffect(() => {
    api.getProfile(true).then((r) => setProfile(r.profile)).catch(() => {});
  }, []);

  const complete = !!(profile?.photo_url || profile?.bio);

  return (
    <div className="card mt-4 flex items-center gap-4 p-5">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-brand-bg">
        {profile?.photo_url && <img src={profile.photo_url} alt="Profile" className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900">Your Profile</div>
        {profile ? (
          <p className="mt-0.5 truncate text-xs text-slate-600">
            {profile.bio || "Add a photo and story so buyers, growers, and partners know who they're working with."}
          </p>
        ) : (
          <div className="mt-1.5 h-3 w-48 max-w-full animate-pulse rounded bg-brand-bg" />
        )}
      </div>
      <button type="button" className="btn-ghost shrink-0" disabled={!profile} onClick={onOpenProfile}>
        {complete ? "Edit Profile" : "Complete Profile"}
      </button>
    </div>
  );
}

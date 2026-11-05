import { useEffect, useState } from "react";
import { api } from "../api";
import { ChipMultiSelect, Spinner } from "../ui";
import { US_STATES } from "../constants";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import AttributeRequestLink from "../AttributeRequestLink";
import type { OwnProfile, ProfileLinkEntry } from "../types";
import ProfilePhotoField from "./ProfilePhotoField";
import GalleryPhotosField from "./GalleryPhotosField";
import BusinessVerificationPanel from "./BusinessVerificationPanel";
import { ME_CHANGED_EVENT } from "../AppNavContext";

/** My own profile — photo/bio/links/contact-visibility, identical for all 4 roles (see
 * migrations/0035_account_profile_fields.sql and backend/profile_routes.py). */
export default function ProfileEditor() {
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [links, setLinks] = useState<ProfileLinkEntry[]>([]);
  const [contactVisible, setContactVisible] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [servicesOffered, setServicesOffered] = useState<string[]>([]);
  const [statesCovered, setStatesCovered] = useState<string[]>([]);
  const [openToEnrollment, setOpenToEnrollment] = useState(false);
  const [isTrader, setIsTrader] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serviceCategories = useTaxonomyTerms("service_category");

  const load = (p: OwnProfile) => {
    setProfile(p);
    setDisplayName(p.display_name ?? "");
    setBio(p.bio ?? "");
    setWebsiteUrl(p.website_url ?? "");
    setLinks(p.links);
    setContactVisible(p.contact_visible);
    setContactName(p.contact_name ?? "");
    setContactPhone(p.contact_phone ?? "");
    setContactEmail(p.contact_email ?? "");
    setServicesOffered(p.services_offered ?? []);
    setStatesCovered(p.states_covered ?? []);
    setOpenToEnrollment(!!p.open_to_program_enrollment);
    setIsTrader(!!p.is_trader);
  };

  useEffect(() => {
    api.getProfile().then((r) => load(r.profile)).catch(() => {});
  }, []);

  const setLinkField = (i: number, field: keyof ProfileLinkEntry, value: string) =>
    setLinks((ls) => ls.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));

  const addLink = () => setLinks((ls) => [...ls, { label: "", url: "" }]);
  const removeLink = (i: number) => setLinks((ls) => ls.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const r = await api.updateProfile({
        display_name: displayName,
        bio, website_url: websiteUrl,
        links: links.filter((l) => l.url.trim()),
        contact_visible: contactVisible,
        contact_name: contactName, contact_phone: contactPhone, contact_email: contactEmail,
        ...(profile?.role === "service_provider" ? { services_offered: servicesOffered, states_covered: statesCovered, is_trader: isTrader } : {}),
        ...(profile?.open_to_program_enrollment !== undefined ? { open_to_program_enrollment: openToEnrollment } : {}),
      });
      const traderChanged = !!profile?.is_trader !== !!r.profile.is_trader;
      load(r.profile);
      setSaved(true);
      if (traderChanged) window.dispatchEvent(new Event(ME_CHANGED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <BusinessVerificationPanel />
      <div className="card space-y-5 p-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Profile</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Visible to other accounts you interact with on the marketplace.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-emerald-700">Saved.</p>}

        <ProfilePhotoField
          photoUrl={profile.photo_url}
          onUpload={api.uploadProfilePhoto}
          onRemove={api.deleteProfilePhoto}
          onChanged={load}
        />

        <GalleryPhotosField
          photos={profile.gallery_photos}
          onUpload={api.uploadGalleryPhoto}
          onRemove={api.deleteGalleryPhoto}
          onChanged={load}
        />

        <div>
          <label className="label">Display Name</label>
          <input className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Shown in the header instead of your login name" />
        </div>

        <div>
          <label className="label">About / Story</label>
          <textarea className="field" rows={4} value={bio} onChange={(e) => setBio(e.target.value)}
            placeholder="Tell buyers, growers, and partners a bit about your operation." />
        </div>

        <div>
          <label className="label">Website</label>
          <input className="field" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://" />
        </div>

        <div>
          <label className="label">Links</label>
          <div className="space-y-2">
            {links.map((l, i) => (
              <div key={i} className="flex gap-2">
                <input className="field" placeholder="Label (e.g. LinkedIn)" value={l.label}
                  onChange={(e) => setLinkField(i, "label", e.target.value)} />
                <input className="field" placeholder="https://" value={l.url}
                  onChange={(e) => setLinkField(i, "url", e.target.value)} />
                <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={() => removeLink(i)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="mt-2 text-sm font-medium text-brand-green hover:underline" onClick={addLink}>
            + Add a link
          </button>
        </div>

        {profile.role === "service_provider" && (
          <div className="border-t border-brand-edge pt-4">
            <h3 className="text-sm font-semibold text-slate-900">Services</h3>
            <div className="mt-3 space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input type="checkbox" checked={isTrader} onChange={(e) => setIsTrader(e.target.checked)} />
                  I'm a Trader — I contract on behalf of buyers
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Traders can represent buyers, place bids on their behalf, and manage their
                  agreements. Leave this off if you only provide technical services (inspection, logistics,
                  financing…).
                </p>
              </div>
              <div>
                <label className="label">Services Offered</label>
                <ChipMultiSelect options={serviceCategories.labels} titles={serviceCategories.titles} selected={servicesOffered} onChange={setServicesOffered} />
                <AttributeRequestLink type="service_category" />
              </div>
              <div>
                <label className="label">States Covered</label>
                <ChipMultiSelect options={US_STATES} selected={statesCovered} onChange={setStatesCovered} />
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-brand-edge pt-4">
          <h3 className="text-sm font-semibold text-slate-900">Contact Info</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Contact Name</label>
              <input className="field" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="field" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="field" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={contactVisible} onChange={(e) => setContactVisible(e.target.checked)} />
            Make my contact info visible to other accounts on my public profile
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Off by default — your contact info is never shown to other accounts unless you turn this on.
          </p>
        </div>

        {profile.open_to_program_enrollment !== undefined && (
          <div className="border-t border-brand-edge pt-4">
            <h3 className="text-sm font-semibold text-slate-900">Program Enrollment</h3>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={openToEnrollment} disabled={!contactEmail.trim()}
                onChange={(e) => setOpenToEnrollment(e.target.checked)} />
              Open to Program Enrollment
            </label>
            <p className="mt-1 text-xs text-slate-500">
              {contactEmail.trim()
                ? "Lets program operators find your farm by name and invite you to their program. You choose whether to accept any invitation — your contact details stay private."
                : "Add your email under Contact Info first — then program operators can find your farm and invite you."}
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-emerald-700">Saved.</p>}
          <button type="button" className="btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useRef, useState } from "react";
import type { GalleryPhoto, OwnProfile } from "../types";

/** Multi-photo gallery (e.g. of the farm) — additive, unlike ProfilePhotoField's single
 * replace-in-place avatar: each photo has its own id and can be removed independently. */
export default function GalleryPhotosField({
  photos, onUpload, onRemove, onChanged,
}: {
  photos: GalleryPhoto[];
  onUpload: (file: File, caption?: string) => Promise<{ profile: OwnProfile }>;
  onRemove: (photoId: string) => Promise<{ profile: OwnProfile }>;
  onChanged: (profile: OwnProfile) => void;
}) {
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const r = await onUpload(file, caption.trim() || undefined);
      onChanged(r.profile);
      setCaption("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const remove = async (photoId: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await onRemove(photoId);
      onChanged(r.profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="label">Farm Photos</label>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {photos.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {photos.map((p) => (
            <div key={p.id}>
              <div className="aspect-square overflow-hidden rounded-lg bg-brand-bg">
                {p.url && <img src={p.url} alt={p.caption || "Farm photo"} className="h-full w-full object-cover" />}
              </div>
              {p.caption && <p className="mt-1 truncate text-xs text-slate-500">{p.caption}</p>}
              <button
                type="button"
                className="mt-0.5 text-xs text-slate-500 hover:text-red-600"
                disabled={busy}
                onClick={() => remove(p.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input className="field" placeholder="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} />
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.gif"
          className="text-sm"
          disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Photos of your farm, facility, or operation — shown on your public profile page. JPG, PNG, WEBP, or GIF, up to 5MB each.
      </p>
    </div>
  );
}

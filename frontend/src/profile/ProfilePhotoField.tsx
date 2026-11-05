import { useRef, useState } from "react";
import type { OwnProfile } from "../types";

/** Profile photo upload/remove slot — single-file upload with an <img> preview and an
 * image-only accept list. */
export default function ProfilePhotoField({
  photoUrl, onUpload, onRemove, onChanged,
}: {
  photoUrl: string | null;
  onUpload: (file: File) => Promise<{ profile: OwnProfile }>;
  onRemove: () => Promise<{ profile: OwnProfile }>;
  onChanged: (profile: OwnProfile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const r = await onUpload(file);
      onChanged(r.profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await onRemove();
      onChanged(r.profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-brand-bg">
        {photoUrl && <img src={photoUrl} alt="Profile" className="h-full w-full object-cover" />}
      </div>
      <div>
        <label className="label">Profile Photo</label>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.gif"
            className="text-sm"
            disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
          />
          {photoUrl && (
            <button type="button" className="text-xs text-slate-500 hover:text-red-600" disabled={busy} onClick={remove}>
              {busy ? "…" : "Remove"}
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">JPG, PNG, WEBP, or GIF, up to 5MB.</p>
      </div>
    </div>
  );
}

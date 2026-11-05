import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { AccountDocument } from "../types";
import { documentLabelFromFilename } from "../format";

/** "Company Documentation" on the signed-in account — Articles of Incorporation, the IRS
 * Confirmation Letter, anything else a superadmin reviews when approving a registration. Same
 * labeled multi-upload shape as the offer / production-data document panels.
 *
 * Reachable even while an account is awaiting approval (see backend auth.py's
 * PENDING_APPROVAL_ALLOWED_PREFIXES), which is why the pending screen can embed it: attaching
 * documentation is what gets such an account approved faster. */
export default function AccountDocumentsPanel({ compact, onChanged }: { compact?: boolean; onChanged?: () => void } = {}) {
  const [documents, setDocuments] = useState<AccountDocument[] | null>(null);
  const [label, setLabel] = useState("");
  // Picking a file stages it; nothing uploads until the Upload button. Previously picking a file
  // uploaded immediately and failed with "give the document a name first" if the name field was
  // still empty, so anyone who chose the file first had to pick it all over again.
  const [staged, setStaged] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => api.accountDocuments().then((r) => setDocuments(r.documents)).catch(() => setDocuments([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);
  const reload = () => { load(); onChanged?.(); };

  const stage = (file: File | undefined) => {
    setError(null);
    // Fill the name from the file unless the user typed their own (a name we auto-filled from a
    // previously-picked file gets replaced).
    const autoFilled = staged && label === documentLabelFromFilename(staged.name);
    if (file && (!label.trim() || autoFilled)) setLabel(documentLabelFromFilename(file.name));
    setStaged(file ?? null);
  };

  const clearStaged = () => {
    setStaged(null);
    setLabel("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const upload = async () => {
    if (!staged) return;
    if (!label.trim()) {
      setError("Give the document a name (e.g. “Articles of Incorporation”)");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await api.uploadAccountDocument(staged, label.trim());
      clearStaged();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (doc: AccountDocument) => {
    try {
      await api.deleteAccountDocument(doc.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  return (
    <div>
      {!compact && <label className="label">Company Documentation</label>}
      <p className="text-xs text-slate-500">
        At least one is needed to publish or respond to listings — e.g. Articles of Incorporation /
        Organization, IRS Confirmation Letter, or your country's registration certificate.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {documents == null ? (
        <p className="mt-2 text-sm text-slate-400">Loading…</p>
      ) : documents.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">No company documents yet.</p>
      ) : (
        <div className="mt-2 divide-y divide-brand-edge">
          {documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="font-medium text-slate-800">{d.label}</span>
              <div className="flex shrink-0 items-center gap-3">
                {d.url && (
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-green hover:underline">
                    View
                  </a>
                )}
                <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={() => remove(d)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 rounded-lg border border-brand-edge p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          className="text-sm"
          disabled={uploading}
          onChange={(e) => stage(e.target.files?.[0])}
        />
        {staged && (
          <div className="mt-2">
            <label className="label">Document name</label>
            <input className="field" placeholder='e.g. "Articles of Incorporation"'
              value={label} onChange={(e) => setLabel(e.target.value)} />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button type="button" className="btn-ghost text-xs" disabled={uploading} onClick={clearStaged}>Cancel</button>
              <button type="button" className="btn-primary !px-3 !py-1.5 text-xs" disabled={uploading} onClick={upload}>
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

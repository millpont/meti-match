import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { documentLabelFromFilename } from "../format";
import type { ProductionDataDocument, ProductionDataDocumentCategory, ProductionDataEntry } from "../types";

type Tab = "all" | "certification";

/** Every document attached to a Production Data commodity default, in one place. The "Add a
 * document" control below is the only way to attach something new — a previously-uploaded
 * legacy soil-test/verification document (the old fixed 2-slot system) still shows up read-only
 * in the list if one exists, but there's no "choose file" input for those slots anymore; that
 * upload ability was fully redundant with the open-ended multi-upload
 * (migrations/0052_production_data_documents.sql). */
export default function ProductionDocumentsPanel({
  entry, onSoilTestChanged, onVerificationChanged,
}: {
  entry: ProductionDataEntry;
  onSoilTestChanged: (next: ProductionDataEntry) => void;
  onVerificationChanged: (next: ProductionDataEntry) => void;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [documents, setDocuments] = useState<ProductionDataDocument[] | null>(null);
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<ProductionDataDocumentCategory>("grower");
  const [uploading, setUploading] = useState(false);
  const [removingLegacy, setRemovingLegacy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => api.productionDataDocuments(entry.commodity).then((r) => setDocuments(r.documents)).catch(() => setDocuments([]));
  useEffect(() => { load(); }, [entry.commodity]);

  const upload = async (file: File) => {
    // No label typed — name it after the file rather than refusing the upload.
    const name = label.trim() || documentLabelFromFilename(file.name);
    setUploading(true);
    setError(null);
    try {
      await api.uploadProductionDataDocument(entry.commodity, file, name, category);
      setLabel("");
      setCategory("grower");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const remove = async (doc: ProductionDataDocument) => {
    try {
      await api.deleteProductionDataDocument(entry.commodity, doc.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  const removeLegacy = async (kind: "soil_test" | "verification") => {
    setRemovingLegacy(kind);
    setError(null);
    try {
      if (kind === "soil_test") {
        await api.deleteSoilTestDocument(entry.commodity);
        onSoilTestChanged({ ...entry, has_soil_test_document: false, soil_test_document_url: null });
      } else {
        await api.deleteVerificationDocument(entry.commodity);
        onVerificationChanged({ ...entry, has_verification_document: false, verification_document_url: null });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setRemovingLegacy(null);
    }
  };

  const legacyDocuments = [
    entry.has_soil_test_document && {
      kind: "soil_test" as const, label: "Soil test document", url: entry.soil_test_document_url,
    },
    entry.has_verification_document && {
      kind: "verification" as const, label: "Third-party verification statement", url: entry.verification_document_url,
    },
  ].filter((d): d is { kind: "soil_test" | "verification"; label: string; url: string | null } => !!d);

  const visibleDocuments = (documents ?? []).filter((d) => tab === "all" || d.category === "certification");
  const visibleLegacyDocuments = tab === "all" ? legacyDocuments : [];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-brand-edge">
        {(["all", "certification"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`relative px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t ? "text-brand-green" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "all" ? "All Documents" : "Certification Documents"}
            {tab === t && <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-brand-green" />}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {documents == null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : visibleDocuments.length === 0 && visibleLegacyDocuments.length === 0 ? (
        <p className="text-sm text-slate-400">{tab === "certification" ? "No certification documents yet." : "No documents yet."}</p>
      ) : (
        <div className="divide-y divide-brand-edge">
          {visibleLegacyDocuments.map((d) => (
            <div key={d.kind} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <span className="font-medium text-slate-800">{d.label}</span>
                <span className="ml-2 text-xs text-slate-400">Grower</span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {d.url && (
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-green hover:underline">
                    View
                  </a>
                )}
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-red-600"
                  disabled={removingLegacy === d.kind}
                  onClick={() => removeLegacy(d.kind)}
                >
                  {removingLegacy === d.kind ? "…" : "Remove"}
                </button>
              </div>
            </div>
          ))}
          {visibleDocuments.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <span className="font-medium text-slate-800">{d.label}</span>
                <span className="ml-2 text-xs text-slate-400">{d.category === "certification" ? "Certification" : "Grower"}</span>
              </div>
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

      <div className="rounded-lg border border-brand-edge p-3">
        <label className="label">Add a document</label>
        <input className="field mt-1" placeholder='Document type (e.g. "Non-GMO Certificate")'
          value={label} onChange={(e) => setLabel(e.target.value)} />
        <div className="mt-2 flex gap-4">
          {(["grower", "certification"] as ProductionDataDocumentCategory[]).map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="radio" name={`production-doc-category-${entry.commodity}`} checked={category === c} onChange={() => setCategory(c)} />
              {c === "grower" ? "Grower Documents" : "Certification Documents"}
            </label>
          ))}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          className="mt-2 text-sm"
          disabled={uploading}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        />
        {uploading && <p className="mt-1 text-xs text-slate-500">Uploading…</p>}
      </div>
    </div>
  );
}

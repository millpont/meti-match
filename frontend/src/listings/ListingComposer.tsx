import { useState, type ReactNode } from "react";
import type { AssetClass } from "../types";
import { ASSET_CLASS_LABELS } from "./environmental";
import OutcomeListingForm from "./OutcomeListingForm";

const CLASSES: AssetClass[] = ["grain", "carbon", "environmental"];

/**
 * Picks what kind of listing to create — Grain (the existing grain form, passed in as
 * `grainForm`), Carbon, or Environmental Data (OutcomeListingForm). Used wherever a bid or offer
 * is created so every market is one click away.
 */
export default function ListingComposer({ side, grainForm, onCreated }: {
  side: "bid" | "offer";
  grainForm: ReactNode;
  /** Called after a carbon/environmental listing is created, with a confirmation notice. */
  onCreated: (notice?: string) => void;
}) {
  const [assetClass, setAssetClass] = useState<AssetClass>("grain");
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div>
      <div role="tablist" aria-label="Market" className="mb-3 inline-flex rounded-lg border border-brand-edge bg-white p-1">
        {CLASSES.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={assetClass === c}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              assetClass === c ? "bg-brand-green text-white" : "text-slate-600 hover:bg-brand-bg"
            }`}
            onClick={() => { setAssetClass(c); setNotice(null); }}
          >
            {ASSET_CLASS_LABELS[c]}
          </button>
        ))}
      </div>
      {notice && <p className="mb-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{notice}</p>}
      {assetClass === "grain"
        ? grainForm
        : (
          <OutcomeListingForm
            key={assetClass}
            side={side}
            assetClass={assetClass}
            onCreated={(n) => { setNotice(n ?? null); onCreated(n); }}
          />
        )}
    </div>
  );
}

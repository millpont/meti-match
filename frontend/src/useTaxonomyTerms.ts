import { useEffect, useState } from "react";
import { api } from "./api";
import type { AttributeSegment, TaxonomyTerm, TaxonomyTermType } from "./types";

// Shared across every hook instance so a list of many cards (each calling this hook for the same
// type) fires one request per type, not one per card — these lists can run into the dozens.
const cache = new Map<TaxonomyTermType, Promise<TaxonomyTerm[]>>();

function loadTerms(type: TaxonomyTermType): Promise<TaxonomyTerm[]> {
  let p = cache.get(type);
  if (!p) {
    p = api.taxonomy(type).then((r) => r.terms).catch(() => {
      cache.delete(type); // don't pin a failed fetch in the cache — let the next mount retry
      return [];
    });
    cache.set(type, p);
  }
  return p;
}

/** Loads one Superadmin-managed vocabulary (attributes/practices/certifications) for a
 * ChipMultiSelect: `labels` for its `options`, `titles` for the hover-tooltip definitions. Also
 * used by read-only displays (SupplyOfferCard, BidCard, GrowersTable) so a picked term's
 * definition is visible on hover wherever it's shown, not just while picking it.
 *
 * `segment` (only meaningful for type === "attribute") narrows to just that segment's terms —
 * e.g. useTaxonomyTerms("attribute", "specialty") for the Specialty Attributes picker. Filtering
 * happens client-side after the shared fetch, so every segment still shares one cached request
 * per type rather than issuing a separate fetch per segment. */
export function useTaxonomyTerms(type: TaxonomyTermType, segment?: AttributeSegment) {
  const [allTerms, setAllTerms] = useState<TaxonomyTerm[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadTerms(type).then((t) => { if (!cancelled) setAllTerms(t); });
    return () => { cancelled = true; };
  }, [type]);

  const terms = segment ? allTerms.filter((t) => t.segment === segment) : allTerms;
  const labels = terms.map((t) => t.label);
  const titles: Record<string, string> = {};
  for (const t of terms) if (t.definition) titles[t.label] = t.definition;

  return { terms, labels, titles };
}

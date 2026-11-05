import type { OutcomeFields } from "../types";
import { Badge } from "../ui";

/** Carbon / environmental-data specifics shown in a listing card's expanded details. Renders
 * nothing for a grain listing. */
export function hasOutcomeDetails(listing: OutcomeFields): boolean {
  return (listing.vintage_years ?? []).length > 0 || (listing.source_states ?? []).length > 0 ||
    (listing.source_commodities ?? []).length > 0 || !!listing.methodology;
}

export default function OutcomeDetails({ listing, dataAttributes = [] }: {
  listing: OutcomeFields;
  /** An offer's "what's included" tags (meti-v2's pricing influences). */
  dataAttributes?: string[];
}) {
  const vintages = listing.vintage_years ?? [];
  const states = listing.source_states ?? [];
  const crops = listing.source_commodities ?? [];
  if (!hasOutcomeDetails(listing) && dataAttributes.length === 0) return null;
  return (
    <>
      {vintages.length > 0 && (
        <div><span className="font-medium text-slate-700">Vintage: </span>{vintages.join(", ")}</div>
      )}
      {states.length > 0 && (
        <div><span className="font-medium text-slate-700">Source States: </span>{states.join(", ")}</div>
      )}
      {crops.length > 0 && (
        <div><span className="font-medium text-slate-700">Associated Crops: </span>{crops.join(", ")}</div>
      )}
      {listing.methodology && (
        <div><span className="font-medium text-slate-700">Methodology / Registry: </span>{listing.methodology}</div>
      )}
      {dataAttributes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-slate-700">Included:</span>
          {dataAttributes.map((d) => <Badge key={d} tone="slate">{d}</Badge>)}
        </div>
      )}
    </>
  );
}

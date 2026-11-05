// One representative photo per commodity (not per variety — see
// src/assets/commodities/ATTRIBUTION.md for sourcing/license details).
import corn from "../assets/commodities/corn.jpg";
import wheat from "../assets/commodities/wheat.jpg";
import soybeans from "../assets/commodities/soybeans.jpg";
import sorghum from "../assets/commodities/sorghum.jpg";
import acresPlaceholder from "../assets/commodities/acres-placeholder.svg";
import carbonPlaceholder from "../assets/commodities/carbon-placeholder.svg";
import environmentalPlaceholder from "../assets/commodities/environmental-placeholder.svg";
import { outcomeByLabel } from "./environmental";

const COMMODITY_IMAGES: Record<string, string> = { Corn: corn, Wheat: wheat, Soybeans: soybeans, Sorghum: sorghum };

export function commodityImage(commodity: string): string | undefined {
  const outcome = outcomeByLabel(commodity);
  if (outcome) return outcome.assetClass === "carbon" ? carbonPlaceholder : environmentalPlaceholder;
  return COMMODITY_IMAGES[commodity];
}

/** Acres-basis listings have no harvested grain to photograph yet — a generic field-boundary
 * graphic stands in for the commodity photo on those cards (see SupplyOfferCard). */
export function acresPlaceholderImage(): string {
  return acresPlaceholder;
}

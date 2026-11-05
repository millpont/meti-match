import { describe, expect, it } from "vitest";
import {
  OUTCOME_LABELS, assetClassOf, bidUnit, contractUnit, isOutcomeListing, outcomesFor, vintageYearOptions,
} from "./environmental";
import { GRAIN_COMMODITIES } from "./constants";

describe("outcome catalog", () => {
  it("never reuses a crop name as an outcome label", () => {
    expect(OUTCOME_LABELS.filter((l) => (GRAIN_COMMODITIES as readonly string[]).includes(l))).toEqual([]);
    expect(new Set(OUTCOME_LABELS).size).toBe(OUTCOME_LABELS.length);
  });

  it("splits outcomes between carbon and environmental data", () => {
    expect(outcomesFor("carbon").map((o) => o.type)).toEqual(["reductions_t", "removals_t", "ci_commodity_t"]);
    expect(outcomesFor("environmental")).toHaveLength(5);
    expect(outcomesFor("grain")).toEqual([]);
  });
});

describe("units", () => {
  it("picks the right unit for each kind of bid", () => {
    expect(bidUnit({ bid_type: "available_grain", area_unit: null, commodity: "Corn" })).toBe("MT");
    expect(bidUnit({ bid_type: "acres_for_contracting", area_unit: "hectares", commodity: "Corn" })).toBe("hectares");
    expect(bidUnit({ bid_type: "environmental_outcome", area_unit: null, commodity: "Carbon Removals", outcome_type: "removals_t" })).toBe("tCO2e");
    // Falls back to the commodity label when outcome_type isn't on the row (e.g. a summary).
    expect(bidUnit({ bid_type: "environmental_outcome", area_unit: null, commodity: "Water Savings" })).toBe("acre-ft");
  });

  it("derives a contract's unit from its commodity", () => {
    expect(contractUnit("Avoided Nitrate")).toBe("lbs");
    expect(contractUnit("Sorghum")).toBe("MT");
  });
});

describe("asset class detection", () => {
  it("treats rows without asset_class as grain unless the commodity is an outcome", () => {
    expect(assetClassOf({ commodity: "Corn" })).toBe("grain");
    expect(assetClassOf({ commodity: "Carbon Reductions" })).toBe("carbon");
    expect(isOutcomeListing({ asset_class: "environmental", commodity: "Field-Level Environmental Data" })).toBe(true);
    expect(isOutcomeListing({ asset_class: "grain", commodity: "Barley" })).toBe(false);
  });

  it("offers vintage years from two years ahead back to 2015", () => {
    const years = vintageYearOptions(new Date("2026-06-01"));
    expect(years[0]).toBe("2028");
    expect(years[years.length - 1]).toBe("2015");
  });
});

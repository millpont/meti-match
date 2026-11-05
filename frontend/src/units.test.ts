import { describe, expect, it } from "vitest";
import { ACRES_PER_HECTARE, fromAcres, toAcres, yieldToVolume } from "./units";

describe("toAcres", () => {
  it("passes acres through unchanged", () => {
    expect(toAcres(50, "acres")).toBe(50);
  });

  it("converts hectares to acres", () => {
    expect(toAcres(10, "hectares")).toBeCloseTo(10 * ACRES_PER_HECTARE);
  });
});

describe("fromAcres", () => {
  it("passes acres through unchanged", () => {
    expect(fromAcres(50, "acres")).toBe(50);
  });

  it("converts acres to hectares", () => {
    expect(fromAcres(10 * ACRES_PER_HECTARE, "hectares")).toBeCloseTo(10);
  });

  it("round-trips through toAcres for an arbitrary unit", () => {
    const original = 123.45;
    expect(fromAcres(toAcres(original, "hectares"), "hectares")).toBeCloseTo(original);
  });
});

describe("yieldToVolume", () => {
  it("computes bushels from bu/acre directly (matches backend units.py)", () => {
    expect(yieldToVolume(50, 150, "bu/acre", "Corn", "bushels")).toBe(7500);
  });

  it("converts bu/acre result to MT using the commodity's bushel weight", () => {
    // 7500 bu * 56 lb/bu / 2204.62262185 lb/MT
    expect(yieldToVolume(50, 150, "bu/acre", "Corn", "MT")).toBeCloseTo((7500 * 56) / 2204.62262185);
  });

  it("converts the area (not the rate) for MT/hectare", () => {
    const acres = 50;
    const expectedMt = (acres / ACRES_PER_HECTARE) * 5;
    expect(yieldToVolume(acres, 5, "MT/hectare", "Wheat", "MT")).toBeCloseTo(expectedMt);
  });

  it("returns null converting to bushels for a commodity with no known bushel weight", () => {
    expect(yieldToVolume(50, 150, "bu/acre", "Unknown Grain", "MT")).toBeNull();
  });
});

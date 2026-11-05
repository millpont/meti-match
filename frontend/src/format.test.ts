import { describe, expect, it } from "vitest";
import { documentLabelFromFilename, formatCurrency, formatNumber, groupDigits, smartMatchScore, stripToNumeric } from "./format";

describe("formatNumber", () => {
  it("adds thousands separators", () => {
    expect(formatNumber(200000)).toBe("200,000");
  });

  it("handles null/undefined", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
  });

  it("caps fraction digits", () => {
    expect(formatNumber(1234.5678, 1)).toBe("1,234.6");
  });
});

describe("formatCurrency", () => {
  it("formats a whole dollar amount with no decimals", () => {
    expect(formatCurrency(1234567)).toBe("$1,234,567");
  });

  it("formats a fractional amount with 2 decimals", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });

  it("handles null", () => {
    expect(formatCurrency(null)).toBe("—");
  });
});

describe("groupDigits / stripToNumeric", () => {
  it("groups the integer part as typed", () => {
    expect(groupDigits("200000")).toBe("200,000");
    expect(groupDigits("1234.50")).toBe("1,234.50");
    expect(groupDigits("12.")).toBe("12.");
    expect(groupDigits("")).toBe("");
  });

  it("strips separators and junk back to a raw number string", () => {
    expect(stripToNumeric("200,000")).toBe("200000");
    expect(stripToNumeric("1,2a3.4.5")).toBe("123.45");
    expect(stripToNumeric("-5")).toBe("5");
    expect(stripToNumeric("-5", true)).toBe("-5");
  });
});

describe("smartMatchScore", () => {
  const fields = ["PLANT Group", "PLANT Group", "IA"];
  it("matches case-, order- and punctuation-insensitively, by prefix", () => {
    expect(smartMatchScore("plant", fields)).not.toBeNull();
    expect(smartMatchScore("group plant", fields)).not.toBeNull();
    expect(smartMatchScore("pla gr", fields)).not.toBeNull();
  });
  it("tolerates a one-letter typo on longer words", () => {
    expect(smartMatchScore("plnat", fields)).toBeNull(); // transposition = 2 edits
    expect(smartMatchScore("plnt", fields)).not.toBeNull();
    expect(smartMatchScore("groop", fields)).not.toBeNull();
  });
  it("rejects when any word misses, and ranks exact above prefix", () => {
    expect(smartMatchScore("plant ranch", fields)).toBeNull();
    expect(smartMatchScore("plant", fields)!).toBeGreaterThan(smartMatchScore("pla", fields)!);
  });
  it("matches everything on an empty query", () => {
    expect(smartMatchScore("  ", fields)).toBe(0);
  });
});

describe("documentLabelFromFilename", () => {
  it("drops the extension and turns separators into spaces", () => {
    expect(documentLabelFromFilename("Articles_of-Incorporation.pdf")).toBe("Articles of Incorporation");
    expect(documentLabelFromFilename("IRS letter.final.docx")).toBe("IRS letter.final");
  });
  it("falls back to the raw name when nothing is left", () => {
    expect(documentLabelFromFilename(".pdf")).toBe(".pdf");
  });
});

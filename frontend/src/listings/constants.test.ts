import { describe, expect, it } from "vitest";
import { marketingYears } from "./constants";

describe("marketingYears", () => {
  it("defaults to 4 consecutive years starting last year", () => {
    const thisYear = new Date().getFullYear();
    expect(marketingYears()).toEqual([
      `${thisYear - 1}-${thisYear}`,
      `${thisYear}-${thisYear + 1}`,
      `${thisYear + 1}-${thisYear + 2}`,
      `${thisYear + 2}-${thisYear + 3}`,
    ]);
  });

  it("honors a custom count and start offset", () => {
    const thisYear = new Date().getFullYear();
    expect(marketingYears(2, 0)).toEqual([
      `${thisYear}-${thisYear + 1}`,
      `${thisYear + 1}-${thisYear + 2}`,
    ]);
  });
});

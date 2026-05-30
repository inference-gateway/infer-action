import { describe, expect, it } from "vitest";
import { formatCost, formatMoney } from "../src/post-results.js";

describe("formatMoney", () => {
  it("renders USD with sub-cent precision", () => {
    expect(formatMoney(0.0008, "USD")).toBe("$0.0008");
  });

  it("pads to two fraction digits for round amounts", () => {
    expect(formatMoney(1.5, "USD")).toBe("$1.50");
  });

  it("trims trailing zeros above the two-digit minimum", () => {
    expect(formatMoney(0.678, "USD")).toBe("$0.678");
  });

  it("renders other ISO currencies with their symbol", () => {
    expect(formatMoney(0.0008, "EUR")).toBe("€0.0008");
  });

  it("falls back to amount + code for malformed currency codes", () => {
    expect(formatMoney(0.0008, "DOLLAR")).toBe("0.0008 DOLLAR");
  });
});

describe("formatCost", () => {
  it("mirrors the tokens line with input/output/total", () => {
    expect(
      formatCost({
        input: 0.678,
        output: 0.0021,
        total: 0.6801,
        currency: "USD",
      }),
    ).toBe("**Cost:** $0.678 in · $0.0021 out · $0.6801 total");
  });

  it("defaults a blank currency to USD", () => {
    expect(formatCost({ input: 1, output: 2, total: 3, currency: "" })).toBe(
      "**Cost:** $1.00 in · $2.00 out · $3.00 total",
    );
  });
});

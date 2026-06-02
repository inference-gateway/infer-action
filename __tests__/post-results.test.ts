import { describe, expect, it } from "vitest";
import {
  formatCost,
  formatMoney,
  formatToolCalls,
} from "../src/post-results.js";

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

describe("formatToolCalls", () => {
  it("reports 100% success when nothing failed", () => {
    expect(formatToolCalls(12, 0)).toBe(
      "**Tool calls:** 12 total · 100% success rate",
    );
  });

  it("rounds the success rate to a whole percent", () => {
    // 10 of 12 succeeded -> 83.33% -> 83%
    expect(formatToolCalls(12, 2)).toBe(
      "**Tool calls:** 12 total · 83% success rate",
    );
    // 7 of 8 succeeded -> 87.5% -> 88%
    expect(formatToolCalls(8, 1)).toBe(
      "**Tool calls:** 8 total · 88% success rate",
    );
  });

  it("reports 0% when every call failed", () => {
    expect(formatToolCalls(5, 5)).toBe(
      "**Tool calls:** 5 total · 0% success rate",
    );
  });

  it("clamps a failed count larger than the total to 0% (never negative)", () => {
    expect(formatToolCalls(3, 5)).toBe(
      "**Tool calls:** 3 total · 0% success rate",
    );
  });

  it("groups large totals with thousands separators", () => {
    expect(formatToolCalls(1234, 0)).toBe(
      "**Tool calls:** 1,234 total · 100% success rate",
    );
  });
});

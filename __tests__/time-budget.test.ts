import { describe, expect, it } from "bun:test";
import { parseTimeBudget, withTimeBudgetNote } from "../src/runner.js";

describe("parseTimeBudget", () => {
  it("is off when empty, zero or not a number", () => {
    expect(parseTimeBudget("")).toBeUndefined();
    expect(parseTimeBudget("0")).toBeUndefined();
    expect(parseTimeBudget("soon")).toBeUndefined();
  });

  it("wraps up at 80% and stops at 100% of the minutes", () => {
    expect(parseTimeBudget("50")).toEqual({
      minutes: 50,
      wrapUpMinutes: 40,
      stopMs: 50 * 60_000,
    });
  });
});

describe("withTimeBudgetNote", () => {
  it("leaves the instructions alone without a budget", () => {
    expect(withTimeBudgetNote("keep it short", undefined)).toBe(
      "keep it short",
    );
  });

  it("appends the budget and its wrap-up minute", () => {
    const note = withTimeBudgetNote("keep it short", parseTimeBudget("50"));
    expect(note.startsWith("keep it short\n\n")).toBe(true);
    expect(note).toContain("budget of 50 minutes");
    expect(note).toContain("wrap up by 40 minutes");
  });
});

import { describe, expect, it } from "bun:test";
import {
  parseTimeBudget,
  withTimeBudgetNote,
  wrapUpFrame,
} from "../src/runner.js";

describe("parseTimeBudget", () => {
  it("is off when empty, zero or not a number", () => {
    expect(parseTimeBudget("")).toBeUndefined();
    expect(parseTimeBudget("0")).toBeUndefined();
    expect(parseTimeBudget("soon")).toBeUndefined();
  });

  it("wraps up at 80% and stops at 100% of the minutes", () => {
    expect(parseTimeBudget("50")).toEqual({
      minutes: 50,
      wrapUpMs: 40 * 60_000,
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
    expect(note).toContain("at 40 minutes you are asked to wrap up");
  });
});

describe("wrapUpFrame", () => {
  it("is one run_agent_input line carrying the text as a user message", () => {
    const frame = wrapUpFrame("<system-reminder>wrap up</system-reminder>");
    expect(frame.endsWith("\n")).toBe(true);
    expect(JSON.parse(frame)).toEqual({
      type: "run_agent_input",
      input: {
        messages: [
          {
            role: "user",
            content: "<system-reminder>wrap up</system-reminder>",
          },
        ],
      },
    });
  });
});

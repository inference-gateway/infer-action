import { describe, expect, it } from "bun:test";
import {
  joinZones,
  PLAN_END,
  RESULT_START,
  SPINNER_BLOCK,
  splitZones,
  stripSpinner,
} from "../src/github.js";

describe("splitZones", () => {
  it("treats whole body as plan when no sentinels exist", () => {
    expect(splitZones("hello world")).toEqual({
      plan: "hello world",
      middle: "",
      result: "",
    });
  });

  it("splits plan and result when only result sentinel exists", () => {
    const body = `Hi\n\n${RESULT_START}\n\nfooter`;
    expect(splitZones(body)).toEqual({
      plan: "Hi\n\n",
      middle: "",
      result: "\n\nfooter",
    });
  });

  it("splits plan and middle when only plan sentinel exists", () => {
    const body = `Hi\n\n${PLAN_END}\n\nmiddle`;
    expect(splitZones(body)).toEqual({
      plan: "Hi\n\n",
      middle: "\n\nmiddle",
      result: "",
    });
  });

  it("splits all three zones when both sentinels exist", () => {
    const body = `P\n\n${PLAN_END}\n\nM\n\n${RESULT_START}\n\nR`;
    expect(splitZones(body)).toEqual({
      plan: "P\n\n",
      middle: "\n\nM\n\n",
      result: "\n\nR",
    });
  });
});

describe("joinZones", () => {
  it("returns just the plan when middle and result are empty", () => {
    expect(joinZones({ plan: "hello", middle: "", result: "" })).toBe("hello");
  });

  it("emits both sentinels when middle is set but result is not", () => {
    const out = joinZones({ plan: "P", middle: "M", result: "" });
    expect(out).toContain(PLAN_END);
    expect(out).toContain(RESULT_START);
    expect(out).toContain("M");
  });

  it("round-trips: split(join(z)) preserves zones (trimmed)", () => {
    const zones = {
      plan: "plan body",
      middle: "middle body",
      result: "result body",
    };
    const round = splitZones(joinZones(zones));
    expect(round.plan.trim()).toBe("plan body");
    expect(round.middle.trim()).toBe("middle body");
    expect(round.result.trim()).toBe("result body");
  });
});

describe("stripSpinner", () => {
  it("removes the spinner block and the blank line after it", () => {
    const body = `${SPINNER_BLOCK}\n\n### Plan\n\n- [ ] do the thing`;
    expect(stripSpinner(body)).toBe("### Plan\n\n- [ ] do the thing");
  });

  it("removes the spinner from the initial cooking message", () => {
    const body = `${SPINNER_BLOCK}\n\nI'm cooking...will get back to you soon...`;
    expect(stripSpinner(body)).toBe(
      "I'm cooking...will get back to you soon...",
    );
  });

  it("strips the spinner even when it sits above the zone sentinels", () => {
    const body = joinZones({
      plan: `${SPINNER_BLOCK}\n\n### Plan`,
      middle: "",
      result: "## ✅ Infer Result: Success",
    });
    const out = stripSpinner(body);
    expect(out).not.toContain("infer:spinner");
    expect(out).toContain("### Plan");
    expect(out).toContain("## ✅ Infer Result: Success");
  });

  it("returns the body unchanged when no spinner is present", () => {
    const body = "### Plan\n\n- [x] done";
    expect(stripSpinner(body)).toBe(body);
  });
});

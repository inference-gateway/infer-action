import { describe, expect, it } from "vitest";
import {
  joinZones,
  PLAN_END,
  RESULT_START,
  splitZones,
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

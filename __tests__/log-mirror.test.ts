import { describe, expect, it } from "bun:test";
import { planLogMirroring } from "../src/log-mirror.js";

describe("planLogMirroring", () => {
  it("mirrors stdout only when INFER_MIRROR_AGENT_LOGS is exactly 'true'", () => {
    expect(planLogMirroring({ INFER_MIRROR_AGENT_LOGS: "true" }).stdout).toBe(
      true,
    );
  });

  it("mutes stdout when the var is 'false'", () => {
    expect(planLogMirroring({ INFER_MIRROR_AGENT_LOGS: "false" }).stdout).toBe(
      false,
    );
  });

  it("mutes stdout when the var is unset (the intrinsic default is quiet)", () => {
    expect(planLogMirroring({}).stdout).toBe(false);
  });

  it("mutes stdout for empty or non-'true' values", () => {
    expect(planLogMirroring({ INFER_MIRROR_AGENT_LOGS: "" }).stdout).toBe(
      false,
    );
    expect(planLogMirroring({ INFER_MIRROR_AGENT_LOGS: "TRUE" }).stdout).toBe(
      false,
    );
    expect(planLogMirroring({ INFER_MIRROR_AGENT_LOGS: "1" }).stdout).toBe(
      false,
    );
    expect(planLogMirroring({ INFER_MIRROR_AGENT_LOGS: "yes" }).stdout).toBe(
      false,
    );
  });

  it("always mirrors stderr, regardless of the gate", () => {
    expect(planLogMirroring({}).stderr).toBe(true);
    expect(planLogMirroring({ INFER_MIRROR_AGENT_LOGS: "true" }).stderr).toBe(
      true,
    );
    expect(planLogMirroring({ INFER_MIRROR_AGENT_LOGS: "false" }).stderr).toBe(
      true,
    );
  });
});

import { describe, expect, it } from "bun:test";
import { planLogMirroring } from "../src/log-mirror.js";

describe("planLogMirroring", () => {
  it("mirrors stdout when INFER_MIRROR_AGENT_LOGS is truthy", () => {
    expect(planLogMirroring({ INFER_MIRROR_AGENT_LOGS: "true" }).stdout).toBe(
      true,
    );
    expect(planLogMirroring({ INFER_MIRROR_AGENT_LOGS: "TRUE" }).stdout).toBe(
      true,
    );
    expect(planLogMirroring({ INFER_MIRROR_AGENT_LOGS: "1" }).stdout).toBe(
      true,
    );
  });

  it("mutes stdout when the var is 'false', even with debug on", () => {
    expect(planLogMirroring({ INFER_MIRROR_AGENT_LOGS: "false" }).stdout).toBe(
      false,
    );
    expect(
      planLogMirroring({
        INFER_MIRROR_AGENT_LOGS: "false",
        INFER_LOGGING_DEBUG: "true",
      }).stdout,
    ).toBe(false);
  });

  it("mutes stdout when both vars are unset (the intrinsic default is quiet)", () => {
    expect(planLogMirroring({}).stdout).toBe(false);
    expect(planLogMirroring({ INFER_MIRROR_AGENT_LOGS: "" }).stdout).toBe(
      false,
    );
    expect(planLogMirroring({ INFER_MIRROR_AGENT_LOGS: "yes" }).stdout).toBe(
      false,
    );
  });

  it("follows INFER_LOGGING_DEBUG when the mirror var is unset or empty", () => {
    expect(planLogMirroring({ INFER_LOGGING_DEBUG: "true" }).stdout).toBe(true);
    expect(
      planLogMirroring({
        INFER_MIRROR_AGENT_LOGS: "",
        INFER_LOGGING_DEBUG: "true",
      }).stdout,
    ).toBe(true);
    expect(planLogMirroring({ INFER_LOGGING_DEBUG: "false" }).stdout).toBe(
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

import { describe, expect, it } from "vitest";
import { finalizeStatus } from "../src/recovery.js";

// finalizeStatus normalises run-agent's raw exit into the status the recover
// step reports. The load-bearing case is the EMPTY exit-code: run-agent never
// reaches the line that sets it when a job timeout kills it mid-run, so an empty
// value must read as a timeout — reported ⚠️ (exit 0), never ❌.
describe("finalizeStatus", () => {
  it("normal success: exit 0 passes through, not stopped, not timed out", () => {
    expect(finalizeStatus("0", false)).toEqual({
      exitCode: "0",
      timedOut: false,
      stoppedEarly: false,
      result: "Agent completed successfully",
    });
  });

  it("normal failure: a non-zero exit passes through as a failure", () => {
    const s = finalizeStatus("1", false);
    expect(s.exitCode).toBe("1");
    expect(s.timedOut).toBe(false);
    expect(s.stoppedEarly).toBe(false);
    expect(s.result).toBe("Agent failed with exit code 1");
  });

  it("finished but incomplete/dirty: stopped early, exit preserved, not timed out", () => {
    const s = finalizeStatus("0", true);
    expect(s.stoppedEarly).toBe(true);
    expect(s.timedOut).toBe(false);
    expect(s.exitCode).toBe("0");
  });

  it("empty exit-code (killed mid-run): timed out, exit normalised to 0, stopped early", () => {
    const s = finalizeStatus("", false);
    expect(s.timedOut).toBe(true);
    expect(s.exitCode).toBe("0");
    expect(s.stoppedEarly).toBe(true);
    expect(s.result).toContain("time limit");
  });

  it("a timeout forces stopped-early even when the tree reads clean after recovery", () => {
    expect(finalizeStatus("", false).stoppedEarly).toBe(true);
  });
});

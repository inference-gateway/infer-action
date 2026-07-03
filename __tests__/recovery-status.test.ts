import { describe, expect, it } from "bun:test";
import type { GitExec } from "../src/recovery.js";
import {
  detectStoppedEarly,
  finalizeStatus,
  shouldDumpTail,
} from "../src/recovery.js";
import type { Todo } from "../src/types.js";

// finalizeStatus normalises run-agent's raw exit into the status the recover
// step reports. The load-bearing distinction is the THIRD argument, `cancelled`
// (the runner's cancel marker): an empty exit-code is a timeout ONLY when the
// marker is present. An empty exit-code WITHOUT the marker is a crash / skipped
// upstream step - a real ❌, never laundered into a soft ⚠️ timeout.
describe("finalizeStatus", () => {
  it("normal success: exit 0 passes through, not stopped, not timed out", () => {
    expect(finalizeStatus("0", false, false)).toEqual({
      exitCode: "0",
      timedOut: false,
      stoppedEarly: false,
      result: "Agent completed successfully",
    });
  });

  it("normal failure: a non-zero exit passes through as a failure", () => {
    const s = finalizeStatus("1", false, false);
    expect(s.exitCode).toBe("1");
    expect(s.timedOut).toBe(false);
    expect(s.stoppedEarly).toBe(false);
    expect(s.result).toBe("Agent failed with exit code 1");
  });

  it("finished but incomplete/dirty: stopped early, exit preserved, not timed out", () => {
    const s = finalizeStatus("0", true, false);
    expect(s.stoppedEarly).toBe(true);
    expect(s.timedOut).toBe(false);
    expect(s.exitCode).toBe("0");
  });

  it("cancel marker present (job timeout): timed out, exit normalised to 0, stopped early", () => {
    const s = finalizeStatus("", false, true);
    expect(s.timedOut).toBe(true);
    expect(s.exitCode).toBe("0");
    expect(s.stoppedEarly).toBe(true);
    expect(s.result).toContain("time limit");
  });

  it("a timeout forces stopped-early even when the tree reads clean after recovery", () => {
    expect(finalizeStatus("", false, true).stoppedEarly).toBe(true);
  });

  it("the cancel marker wins even if a non-zero exit-code leaked through (never ❌)", () => {
    const s = finalizeStatus("1", false, true);
    expect(s.timedOut).toBe(true);
    expect(s.exitCode).toBe("0");
  });

  it("empty exit-code WITHOUT the marker is a real failure, not a timeout", () => {
    const s = finalizeStatus("", false, false);
    expect(s.timedOut).toBe(false);
    expect(s.exitCode).toBe("1");
    expect(s.stoppedEarly).toBe(true);
    expect(s.result).not.toContain("time limit");
  });
});

describe("shouldDumpTail", () => {
  it("stays quiet on a graceful exit 0", () => {
    expect(shouldDumpTail("0", false)).toBe(false);
  });

  it("dumps on a non-zero exit", () => {
    expect(shouldDumpTail("1", false)).toBe(true);
  });

  it("dumps on an empty exit-code (crash)", () => {
    expect(shouldDumpTail("", false)).toBe(true);
  });

  it("dumps when cancelled, even with exit 0", () => {
    expect(shouldDumpTail("0", true)).toBe(true);
  });
});

function todos(...statuses: string[]): Todo[] {
  return statuses.map((status) => ({ status })) as unknown as Todo[];
}

function gitFake(responses: Array<[string, string]>): {
  git: GitExec;
  calls: string[];
} {
  const calls: string[] = [];
  const git: GitExec = (cmd) => {
    calls.push(cmd);
    for (const [needle, val] of responses) {
      if (cmd.includes(needle)) return val;
    }
    return "";
  };
  return { git, calls };
}

describe("detectStoppedEarly", () => {
  it("flags an untracked file the agent never committed", () => {
    const { git, calls } = gitFake([["status --porcelain", "?? new.txt\n"]]);

    expect(detectStoppedEarly(todos("completed"), true, git)).toBe(true);
    expect(calls.some((c) => c.includes("--untracked-files=no"))).toBe(false);
  });

  it("flags committed-but-unpushed work on a clean tree", () => {
    const { git } = gitFake([
      ["status --porcelain", ""],
      ["branch --show-current", "fix/issue-1"],
      ["rev-parse", "origin/fix/issue-1"],
      ["rev-list --count", "1"],
    ]);

    expect(detectStoppedEarly(todos("completed"), true, git)).toBe(true);
  });

  it("reads clean when everything is pushed and todos are complete", () => {
    const { git } = gitFake([
      ["status --porcelain", ""],
      ["branch --show-current", "fix/issue-1"],
      ["rev-parse", "origin/fix/issue-1"],
      ["rev-list --count", "0"],
    ]);

    expect(detectStoppedEarly(todos("completed"), true, git)).toBe(false);
  });

  it("flags incomplete todos without touching git when git ops are off", () => {
    const { git, calls } = gitFake([]);

    expect(detectStoppedEarly(todos("in_progress"), false, git)).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

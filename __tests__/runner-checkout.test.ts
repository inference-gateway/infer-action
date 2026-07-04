import { describe, expect, test } from "bun:test";
import { ensurePrHeadCheckedOut } from "../src/runner.js";
import type { PullRequestContext } from "../src/context.js";

function prCtx(
  overrides: Partial<PullRequestContext> = {},
): PullRequestContext {
  return {
    kind: "pull_request",
    prNumber: 42,
    prTitle: "t",
    prBody: "",
    headRef: "fix/thing",
    baseRef: "main",
    headRepoFullName: "o/r",
    isFork: false,
    triggeringCommentId: 1,
    comments: [],
    ...overrides,
  };
}

function missingRefError(): Error {
  const e = new Error("Command failed: bash -c git fetch origin fix/thing");
  (e as Error & { stderr: string }).stderr =
    "fatal: couldn't find remote ref fix/thing\n";
  return e;
}

describe("ensurePrHeadCheckedOut", () => {
  test("non-fork happy path fetches and checks out the head branch", () => {
    const calls: string[] = [];
    ensurePrHeadCheckedOut(prCtx(), (cmd) => {
      calls.push(cmd);
      return "";
    });
    expect(calls).toEqual([
      "git fetch origin fix/thing",
      "git checkout fix/thing",
    ]);
  });

  test("deleted head branch falls back to pull/N/head", () => {
    const calls: string[] = [];
    ensurePrHeadCheckedOut(prCtx(), (cmd) => {
      calls.push(cmd);
      if (cmd === "git fetch origin fix/thing") throw missingRefError();
      return "";
    });
    expect(calls).toEqual([
      "git fetch origin fix/thing",
      "git fetch origin pull/42/head:fix/thing",
      "git checkout fix/thing",
    ]);
  });

  test("non-missing-ref fetch failure aborts without fallback", () => {
    const calls: string[] = [];
    expect(() =>
      ensurePrHeadCheckedOut(prCtx(), (cmd) => {
        calls.push(cmd);
        throw new Error("fatal: Authentication failed");
      }),
    ).toThrow(/Failed to check out PR head/);
    expect(calls).toEqual(["git fetch origin fix/thing"]);
  });

  test("fallback failure still aborts with the descriptive error", () => {
    expect(() =>
      ensurePrHeadCheckedOut(prCtx(), (cmd) => {
        if (cmd === "git fetch origin fix/thing") throw missingRefError();
        throw new Error("fatal: network down");
      }),
    ).toThrow(/Failed to check out PR head/);
  });

  test("fork PR fetches pull/N/head into a local branch", () => {
    const calls: string[] = [];
    ensurePrHeadCheckedOut(prCtx({ isFork: true }), (cmd) => {
      calls.push(cmd);
      return "";
    });
    expect(calls).toEqual([
      "git fetch origin pull/42/head:pr-42",
      "git checkout pr-42",
    ]);
  });
});

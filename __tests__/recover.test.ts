import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitExec, RecoveryContext } from "../src/recovery.js";
import { recoverUnpushedWork, recoveryContext } from "../src/recovery.js";
import type { OpenPr } from "../src/github.js";

// Recovery is driven entirely through an injected git runner and a structural
// GithubClient double, so these tests never spawn git or touch the network.

type GitHandler = (cmd: string) => string;

function recordingGit(handler: GitHandler): { git: GitExec; calls: string[] } {
  const calls: string[] = [];
  const git: GitExec = (cmd) => {
    calls.push(cmd);
    return handler(cmd);
  };
  return { git, calls };
}

// A git double for the canonical "on main with a dirty tree" recovery. Override
// individual responses (by command substring) per test; a function value may
// throw to simulate a failing command (e.g. a rejected push).
function gitDouble(
  over: Array<[string, string | (() => string)]> = [],
): GitHandler {
  return (cmd: string): string => {
    for (const [needle, val] of over) {
      if (cmd.includes(needle)) {
        return typeof val === "function" ? val() : val;
      }
    }
    if (cmd.includes("branch --show-current")) return "main";
    if (cmd.includes("status --porcelain")) return " M src/x.ts\n";
    if (cmd.includes("rev-parse") && cmd.includes("@{upstream}"))
      return "origin/main";
    if (cmd.includes("rev-list --count")) return "0";
    if (cmd.includes("ls-remote")) return "";
    if (cmd.includes("diff --cached --name-only")) return "src/x.ts\n";
    if (cmd.includes("git log")) return "fix: resolve #42\n";
    if (cmd.includes("diff --stat")) return " src/x.ts | 2 +-\n";
    return "";
  };
}

interface FakeGithub {
  getOpenPrForBranch: ReturnType<typeof vi.fn>;
  createDraftPr: ReturnType<typeof vi.fn>;
  getDefaultBranch: ReturnType<typeof vi.fn>;
}

const A_PR: OpenPr = {
  number: 7,
  url: "https://github.com/o/r/pull/7",
  body: "",
  baseRef: "main",
};

function makeGithub(over: Partial<FakeGithub> = {}): FakeGithub {
  return {
    getOpenPrForBranch: vi.fn().mockResolvedValue(null),
    createDraftPr: vi.fn().mockResolvedValue(A_PR),
    getDefaultBranch: vi.fn().mockResolvedValue("main"),
    ...over,
  };
}

const ISSUE_42: RecoveryContext = { kind: "issue", issueNumber: 42 };

function run(
  github: FakeGithub,
  git: GitExec,
  over: Partial<{
    context: RecoveryContext;
    dryRun: boolean;
    runId: string;
  }> = {},
) {
  return recoverUnpushedWork({
    github: github as never,
    dryRun: over.dryRun ?? false,
    context: over.context ?? ISSUE_42,
    runId: over.runId ?? "999",
    git,
  });
}

describe("recoverUnpushedWork", () => {
  let logs: string[];
  let errs: string[];
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logs = [];
    errs = [];
    logSpy = vi.spyOn(console, "log").mockImplementation((m: unknown) => {
      logs.push(String(m));
    });
    errSpy = vi.spyOn(console, "error").mockImplementation((m: unknown) => {
      errs.push(String(m));
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("on main with a dirty tree: branches, commits, pushes, opens a draft PR", async () => {
    const { git, calls } = recordingGit(gitDouble());
    const github = makeGithub();

    const pr = await run(github, git);

    expect(calls).toContain("git checkout -B fix/issue-42");
    expect(calls).toContain("git add -A");
    expect(calls.some((c) => c.startsWith("git commit -m"))).toBe(true);
    expect(calls).toContain("git push -u origin fix/issue-42");
    expect(github.createDraftPr).toHaveBeenCalledTimes(1);
    const arg = github.createDraftPr.mock.calls[0]![0];
    expect(arg.head).toBe("fix/issue-42");
    expect(arg.base).toBe("main");
    expect(arg.body).toContain("Resolves #42");
    expect(pr).toEqual(A_PR);
  });

  it("branch with unpushed commits and a clean tree: pushes and opens a PR, no commit", async () => {
    const { git, calls } = recordingGit(
      gitDouble([
        ["branch --show-current", "fix/issue-7"],
        ["status --porcelain", ""], // clean
        ["rev-parse", ""],
        ["ls-remote", ""],
        ["rev-list --count origin/HEAD", "2"],
      ]),
    );
    const github = makeGithub();

    await run(github, git, { context: { kind: "issue", issueNumber: 7 } });

    expect(calls.some((c) => c.includes("checkout -B"))).toBe(false);
    expect(calls.some((c) => c.startsWith("git commit"))).toBe(false);
    expect(calls).toContain("git push -u origin fix/issue-7");
    expect(github.createDraftPr).toHaveBeenCalledTimes(1);
  });

  it("PR already exists for the branch: pushes but does not create a second PR", async () => {
    const { git } = recordingGit(gitDouble());
    const existing: OpenPr = { ...A_PR, number: 9 };
    const github = makeGithub({
      getOpenPrForBranch: vi.fn().mockResolvedValue(existing),
    });

    const pr = await run(github, git);

    expect(github.createDraftPr).not.toHaveBeenCalled();
    expect(pr).toEqual(existing);
  });

  it("clean tree and nothing unpushed: full no-op", async () => {
    const { git, calls } = recordingGit(
      gitDouble([
        ["status --porcelain", ""],
        ["rev-list --count", "0"],
      ]),
    );
    const github = makeGithub();

    const pr = await run(github, git);

    expect(pr).toBeNull();
    expect(calls.some((c) => c.includes("checkout"))).toBe(false);
    expect(calls.some((c) => c.startsWith("git commit"))).toBe(false);
    expect(calls.some((c) => c.includes("push"))).toBe(false);
    expect(github.createDraftPr).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("[recover] nothing to recover");
  });

  it("fail-soft when the push is rejected: no PR, no throw", async () => {
    const { git } = recordingGit(
      gitDouble([
        [
          "push",
          () => {
            throw new Error("! [rejected] (fetch first)");
          },
        ],
      ]),
    );
    const github = makeGithub();

    const pr = await run(github, git);

    expect(pr).toBeNull();
    expect(github.createDraftPr).not.toHaveBeenCalled();
    expect(errs.join("\n")).toContain("push of fix/issue-42 rejected");
  });

  it("fail-soft when createDraftPr throws: resolves null", async () => {
    const { git } = recordingGit(gitDouble());
    const github = makeGithub({
      createDraftPr: vi.fn().mockRejectedValue(new Error("422")),
    });

    const pr = await run(github, git);

    expect(pr).toBeNull();
    expect(errs.join("\n")).toContain("[recover] failed");
  });

  it("never pushes main or master", async () => {
    const { git, calls } = recordingGit(gitDouble());
    const github = makeGithub();

    await run(github, git);

    const pushes = calls.filter((c) => c.includes("git push"));
    expect(pushes.length).toBeGreaterThan(0);
    for (const p of pushes) {
      expect(p).not.toMatch(/origin (main|master)\b/);
    }
  });

  it("treats a detached HEAD like being on main (creates a branch)", async () => {
    const { git, calls } = recordingGit(
      gitDouble([["branch --show-current", ""]]),
    );
    const github = makeGithub();

    await run(github, git);

    expect(calls).toContain("git checkout -B fix/issue-42");
  });

  it("direct context: derives an infer/auto-<runId> branch and a body without an issue link", async () => {
    const { git, calls } = recordingGit(gitDouble());
    const github = makeGithub();

    await run(github, git, { context: { kind: "direct" }, runId: "12345" });

    expect(calls).toContain("git checkout -B infer/auto-12345");
    expect(calls).toContain("git push -u origin infer/auto-12345");
    const arg = github.createDraftPr.mock.calls[0]![0];
    expect(arg.head).toBe("infer/auto-12345");
    expect(arg.body).not.toContain("Resolves #");
  });

  it("dry-run: detects work but performs no mutation and opens no PR", async () => {
    const { git, calls } = recordingGit(gitDouble());
    const github = makeGithub();

    const pr = await run(github, git, { dryRun: true });

    expect(pr).toBeNull();
    expect(calls.some((c) => c.includes("checkout"))).toBe(false);
    expect(calls.some((c) => c.includes("push"))).toBe(false);
    expect(github.createDraftPr).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain(
      "[dry-run] [recover] would recover work to fix/issue-42",
    );
  });

  it("skip context (fork PR / git ops off): immediate no-op, git never touched", async () => {
    const { git, calls } = recordingGit(gitDouble());
    const github = makeGithub();

    const pr = await run(github, git, { context: { kind: "skip" } });

    expect(pr).toBeNull();
    expect(calls).toHaveLength(0);
    expect(github.getOpenPrForBranch).not.toHaveBeenCalled();
    expect(github.createDraftPr).not.toHaveBeenCalled();
  });

  it("empty-commit guard: dirty but nothing staged and not ahead → no commit, no push", async () => {
    const { git, calls } = recordingGit(
      gitDouble([
        ["diff --cached --name-only", ""], // add -A staged nothing
        ["rev-list --count", "0"], // not ahead
      ]),
    );
    const github = makeGithub();

    const pr = await run(github, git);

    expect(calls).toContain("git add -A");
    expect(calls.some((c) => c.startsWith("git commit"))).toBe(false);
    expect(calls.some((c) => c.includes("push"))).toBe(false);
    expect(github.createDraftPr).not.toHaveBeenCalled();
    expect(pr).toBeNull();
  });

  it("pull-request context: commits and pushes to the existing branch, opens no new PR", async () => {
    const { git, calls } = recordingGit(
      gitDouble([["branch --show-current", "feature-x"]]),
    );
    const github = makeGithub();

    const pr = await run(github, git, {
      context: { kind: "pr", headRef: "feature-x", baseRef: "main" },
    });

    expect(calls.some((c) => c.includes("checkout -B"))).toBe(false);
    expect(calls.some((c) => c.startsWith("git commit"))).toBe(true);
    expect(calls).toContain("git push -u origin feature-x");
    expect(github.getOpenPrForBranch).not.toHaveBeenCalled();
    expect(github.createDraftPr).not.toHaveBeenCalled();
    expect(pr).toBeNull();
  });
});

describe("recoveryContext", () => {
  it("maps issue/direct to themselves", () => {
    expect(
      recoveryContext({
        kind: "issue",
        issueNumber: 5,
        issueTitle: "t",
        issueBody: "b",
      }),
    ).toEqual({ kind: "issue", issueNumber: 5 });
    expect(recoveryContext({ kind: "direct", prompt: "do it" })).toEqual({
      kind: "direct",
    });
  });

  it("maps a same-repo PR to pr, and a fork PR to skip", () => {
    const base = {
      kind: "pull_request" as const,
      prNumber: 1,
      prTitle: "t",
      prBody: "b",
      headRef: "feature-x",
      baseRef: "main",
      headRepoFullName: "o/r",
      triggeringCommentId: 0,
      comments: [],
    };
    expect(recoveryContext({ ...base, isFork: false })).toEqual({
      kind: "pr",
      headRef: "feature-x",
      baseRef: "main",
    });
    expect(recoveryContext({ ...base, isFork: true })).toEqual({
      kind: "skip",
    });
  });
});

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import type { GitExec, RecoveryContext } from "../src/recovery.js";
import { recoverUnpushedWork, recoveryContext } from "../src/recovery.js";
import type { BranchPr, OpenPr } from "../src/github.js";

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
    if (cmd.includes("diff --quiet")) {
      // treeMatchesBase probes tree identity with `git diff --quiet`, which
      // exits non-zero (throws) when the trees differ. Differing is the
      // default here so the canonical recovery has real content and reaches
      // PR creation; tree-identical tests override this to return "".
      throw new Error("trees differ");
    }
    return "";
  };
}

interface FakeGithub {
  getPrForBranch: ReturnType<typeof mock>;
  createDraftPr: ReturnType<typeof mock>;
  getDefaultBranch: ReturnType<typeof mock>;
}

const A_PR: OpenPr = {
  number: 7,
  url: "https://github.com/o/r/pull/7",
  body: "",
  baseRef: "main",
};

const OPEN_PR: BranchPr = { ...A_PR, state: "open", merged: false };
const MERGED_PR: BranchPr = {
  ...A_PR,
  number: 9,
  state: "closed",
  merged: true,
};
const CLOSED_PR: BranchPr = {
  ...A_PR,
  number: 11,
  state: "closed",
  merged: false,
};

function makeGithub(over: Partial<FakeGithub> = {}): FakeGithub {
  return {
    getPrForBranch: mock().mockResolvedValue(null),
    createDraftPr: mock().mockResolvedValue(A_PR),
    getDefaultBranch: mock().mockResolvedValue("main"),
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
  let logSpy: ReturnType<typeof spyOn>;
  let errSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logs = [];
    errs = [];
    logSpy = spyOn(console, "log").mockImplementation((m: unknown) => {
      logs.push(String(m));
    });
    errSpy = spyOn(console, "error").mockImplementation((m: unknown) => {
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

    expect(calls).toContain("git checkout -B 'fix/issue-42'");
    expect(calls).toContain("git add -A");
    expect(calls.some((c) => c.startsWith("git commit -m"))).toBe(true);
    expect(calls).toContain("git push -u origin 'fix/issue-42'");
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
    expect(calls).toContain("git push -u origin 'fix/issue-7'");
    expect(github.createDraftPr).toHaveBeenCalledTimes(1);
  });

  it("open PR already exists for the branch: pushes but does not create a second PR", async () => {
    const { git, calls } = recordingGit(gitDouble());
    const github = makeGithub({
      getPrForBranch: mock().mockResolvedValue(OPEN_PR),
    });

    const pr = await run(github, git);

    expect(calls).toContain("git push -u origin 'fix/issue-42'");
    expect(github.createDraftPr).not.toHaveBeenCalled();
    expect(pr).toEqual(OPEN_PR);
  });

  it("merged PR + dirty tree: commits and pushes the new work but never opens a duplicate PR", async () => {
    const { git, calls } = recordingGit(gitDouble());
    const github = makeGithub({
      getPrForBranch: mock().mockResolvedValue(MERGED_PR),
    });

    const pr = await run(github, git);

    expect(calls.some((c) => c.startsWith("git commit"))).toBe(true);
    expect(calls).toContain("git push -u origin 'fix/issue-42'");
    expect(github.createDraftPr).not.toHaveBeenCalled();
    expect(pr).toBeNull();
    expect(logs.join("\n")).toContain(
      "already merged; work pushed to fix/issue-42 but not opening a duplicate PR",
    );
  });

  it("closed-unmerged PR: pushes the work but never re-opens a PR a human closed", async () => {
    const { git, calls } = recordingGit(gitDouble());
    const github = makeGithub({
      getPrForBranch: mock().mockResolvedValue(CLOSED_PR),
    });

    const pr = await run(github, git);

    expect(calls).toContain("git push -u origin 'fix/issue-42'");
    expect(github.createDraftPr).not.toHaveBeenCalled();
    expect(pr).toBeNull();
    expect(logs.join("\n")).toContain("already closed");
  });

  it("#130 replay: merged PR, clean tree, false 'ahead' vs squashed base, identical tree → full no-op", async () => {
    // After a squash-merge + remote branch deletion, rev-list vs origin/HEAD
    // reports the branch "ahead" even though everything already landed. The
    // ghost-signal guard must bail before the push re-creates the deleted
    // remote branch or a duplicate PR is considered.
    const { git, calls } = recordingGit(
      gitDouble([
        ["branch --show-current", "fix/issue-42"],
        ["status --porcelain", ""], // clean
        ["rev-parse", ""], // no upstream
        ["ls-remote", ""], // remote branch deleted post-merge
        ["rev-list --count", "2"], // false "ahead" vs squashed main tip
        ["diff --quiet", ""], // tree identical to origin/main
      ]),
    );
    const github = makeGithub({
      getPrForBranch: mock().mockResolvedValue(MERGED_PR),
    });

    const pr = await run(github, git);

    expect(pr).toBeNull();
    expect(calls.some((c) => c.includes("push"))).toBe(false);
    expect(calls.some((c) => c.startsWith("git commit"))).toBe(false);
    expect(github.createDraftPr).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("nothing to salvage");
  });

  it("no PR but tree identical to base: pushes yet skips PR creation (secondary guard)", async () => {
    const { git, calls } = recordingGit(
      gitDouble([
        ["branch --show-current", "fix/issue-42"],
        ["status --porcelain", ""], // clean
        ["rev-parse", ""],
        ["ls-remote", "abc123\trefs/heads/fix/issue-42"],
        ["rev-list --count", "1"],
        ["diff --quiet", ""], // tree identical to origin/main
      ]),
    );
    const github = makeGithub();

    const pr = await run(github, git);

    expect(calls).toContain("git push -u origin 'fix/issue-42'");
    expect(github.createDraftPr).not.toHaveBeenCalled();
    expect(pr).toBeNull();
    expect(logs.join("\n")).toContain("tree-identical to origin/main");
  });

  it("PR lookup failure: still pushes the work but never risks a duplicate PR", async () => {
    const { git, calls } = recordingGit(gitDouble());
    const github = makeGithub({
      getPrForBranch: mock().mockRejectedValue(new Error("api down")),
    });

    const pr = await run(github, git);

    expect(calls).toContain("git push -u origin 'fix/issue-42'");
    expect(github.createDraftPr).not.toHaveBeenCalled();
    expect(pr).toBeNull();
    expect(errs.join("\n")).toContain("PR lookup for fix/issue-42 failed");
    expect(logs.join("\n")).toContain(
      "skipping PR creation because the PR lookup failed",
    );
  });

  it("salvaged draft PR carries the (salvaged) title and auto-opened banner", async () => {
    const { git } = recordingGit(gitDouble());
    const github = makeGithub();

    await run(github, git);

    const arg = github.createDraftPr.mock.calls[0]![0];
    expect(arg.title).toBe("fix: resolve #42 (salvaged)");
    expect(arg.body).toContain(
      "opened automatically by infer-action's salvage step",
    );
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

  it("non-fast-forward push: rebases and retries the push", async () => {
    // The remote advanced past our local tip (e.g. another recovery / a human
    // landed a commit on the same branch while we were working). The recover
    // step should detect the rejection, pull --rebase to integrate the new
    // tip, and retry the push. This is the regression test for issue #99
    // where the work was being silently dropped on push rejection.
    const pushCalls: string[] = [];
    const rebaseCalls: string[] = [];
    const handler: GitHandler = (cmd) => {
      if (cmd.startsWith("git push -u origin")) {
        pushCalls.push(cmd);
        if (pushCalls.length === 1) {
          throw new Error(
            "! [rejected]        fix/issue-42 -> fix/issue-42 (fetch first)\n" +
              "error: failed to push some refs to 'https://github.com/inference-gateway/infer-action'\n" +
              "hint: Updates were rejected because the remote contains work that you do not have locally.",
          );
        }
        return "";
      }
      if (cmd.startsWith("git pull --rebase")) {
        rebaseCalls.push(cmd);
        return "";
      }
      // First push went out, then someone else pushed - so the local is now
      // behind remote by one commit. Reflect that for the rebase path.
      if (cmd.startsWith("git rev-parse") && cmd.includes("@{upstream}"))
        return "origin/fix/issue-42";
      if (cmd.startsWith("git rev-list --count")) return "1";
      if (cmd.startsWith("git diff --quiet")) throw new Error("trees differ");
      return "";
    };
    const { git } = recordingGit(handler);
    const github = makeGithub();

    const pr = await run(github, git);

    expect(pushCalls.length).toBe(2);
    expect(rebaseCalls.length).toBe(1);
    expect(rebaseCalls[0]).toContain("origin 'fix/issue-42'");
    expect(pr).toEqual(A_PR);
    expect(github.createDraftPr).toHaveBeenCalledTimes(1);
    expect(logs.join("\n")).toContain("rebased fix/issue-42");
  });

  it("rebase conflicts during push-retry: leaves local commits, no PR", async () => {
    // The pull --rebase fails (e.g. merge conflict) - recovery should still
    // fail-soft, log, and return null. The local commit stays in the working
    // tree so a maintainer can resolve the conflict manually.
    const handler: GitHandler = (cmd) => {
      if (cmd.startsWith("git push -u origin"))
        throw new Error("! [rejected] (fetch first)");
      if (cmd.startsWith("git pull --rebase"))
        throw new Error("CONFLICT (content): Merge conflict in src/x.ts");
      if (cmd.includes("branch --show-current")) return "fix/issue-42";
      if (cmd.includes("status --porcelain")) return " M src/x.ts\n";
      if (cmd.includes("rev-parse") && cmd.includes("@{upstream}"))
        return "origin/fix/issue-42";
      if (cmd.includes("rev-list --count")) return "1";
      if (cmd.includes("diff --cached --name-only")) return "src/x.ts\n";
      if (cmd.includes("git log")) return "fix: resolve #42\n";
      if (cmd.includes("diff --stat")) return " src/x.ts | 2 +-\n";
      return "";
    };
    const { git } = recordingGit(handler);
    const github = makeGithub();

    const pr = await run(github, git);

    expect(pr).toBeNull();
    expect(github.createDraftPr).not.toHaveBeenCalled();
    expect(errs.join("\n")).toContain(
      "push of fix/issue-42 failed after rebase retry",
    );
  });

  it("non-non-fast-forward push failure (auth/network) is not retried", async () => {
    // A plain auth error must NOT trigger a rebase - we don't want to rewrite
    // history on top of a failure that has nothing to do with a diverged
    // remote tip. The fallback only fires on the well-known NFF shapes.
    const rebaseCalls: string[] = [];
    const handler: GitHandler = (cmd) => {
      if (cmd.startsWith("git push -u origin"))
        throw new Error(
          "fatal: Authentication failed for 'https://github.com/x'",
        );
      if (cmd.startsWith("git pull --rebase")) rebaseCalls.push(cmd);
      if (cmd.includes("branch --show-current")) return "fix/issue-42";
      if (cmd.includes("status --porcelain")) return " M src/x.ts\n";
      if (cmd.includes("rev-parse") && cmd.includes("@{upstream}"))
        return "origin/fix/issue-42";
      if (cmd.includes("rev-list --count")) return "1";
      if (cmd.includes("diff --cached --name-only")) return "src/x.ts\n";
      if (cmd.includes("git log")) return "fix: resolve #42\n";
      if (cmd.includes("diff --stat")) return " src/x.ts | 2 +-\n";
      return "";
    };
    const { git } = recordingGit(handler);
    const github = makeGithub();

    const pr = await run(github, git);

    expect(pr).toBeNull();
    expect(rebaseCalls.length).toBe(0);
    expect(errs.join("\n")).toContain(
      "push of fix/issue-42 failed after rebase retry",
    );
  });

  it("legacy 'push rejected' error message is still fail-soft when rebase can't recover", async () => {
    // Back-compat: callers / test fixtures that still expect the old log
    // shape. With the new rebase fallback the call goes through the
    // pull --rebase path first; if rebase throws too, the catch in
    // recoverUnpushedWork logs the new "failed after rebase retry" line.
    const { git } = recordingGit(
      gitDouble([
        [
          "push",
          () => {
            throw new Error("! [rejected] (fetch first)");
          },
        ],
        [
          "pull --rebase",
          () => {
            throw new Error("fatal: no remote ref to rebase onto");
          },
        ],
      ]),
    );
    const github = makeGithub();

    const pr = await run(github, git);

    expect(pr).toBeNull();
    expect(github.createDraftPr).not.toHaveBeenCalled();
    expect(errs.join("\n")).toContain(
      "push of fix/issue-42 failed after rebase retry",
    );
  });

  it("fail-soft when createDraftPr throws: resolves null", async () => {
    const { git } = recordingGit(gitDouble());
    const github = makeGithub({
      createDraftPr: mock().mockRejectedValue(new Error("422")),
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

    expect(calls).toContain("git checkout -B 'fix/issue-42'");
  });

  it("direct context: derives an infer/auto-<runId> branch and a body without an issue link", async () => {
    const { git, calls } = recordingGit(gitDouble());
    const github = makeGithub();

    await run(github, git, { context: { kind: "direct" }, runId: "12345" });

    expect(calls).toContain("git checkout -B 'infer/auto-12345'");
    expect(calls).toContain("git push -u origin 'infer/auto-12345'");
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
    expect(github.getPrForBranch).not.toHaveBeenCalled();
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
    expect(calls).toContain("git push -u origin 'feature-x'");
    expect(github.getPrForBranch).not.toHaveBeenCalled();
    expect(github.createDraftPr).not.toHaveBeenCalled();
    expect(pr).toBeNull();
  });

  it("shell-quotes a branch name with metacharacters before it reaches the shell", async () => {
    const evil = "evil;touch pwned";
    const { git, calls } = recordingGit(
      gitDouble([["branch --show-current", evil]]),
    );
    const github = makeGithub();

    await run(github, git, {
      context: { kind: "pr", headRef: evil, baseRef: "main" },
    });

    expect(calls).toContain(`git push -u origin '${evil}'`);
    expect(calls.some((c) => c.includes("origin evil;touch"))).toBe(false);
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

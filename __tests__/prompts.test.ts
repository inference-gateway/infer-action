import { afterEach, describe, expect, it } from "bun:test";
import type {
  DirectContext,
  IssueContext,
  PrComment,
  PullRequestContext,
} from "../src/context.js";
import {
  buildSystemPrompt,
  buildTask,
  systemPromptOverrideWarnings,
} from "../src/prompts.js";

// bun:test has no vi.stubEnv equivalent; save/restore process.env manually.
const envBackup = new Map<string, string | undefined>();
function stubEnv(name: string, value: string): void {
  if (!envBackup.has(name)) envBackup.set(name, process.env[name]);
  process.env[name] = value;
}
function unstubAllEnvs(): void {
  for (const [name, prev] of envBackup) {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
  envBackup.clear();
}

afterEach(() => {
  unstubAllEnvs();
});

function issueCtx(overrides: Partial<IssueContext> = {}): IssueContext {
  return {
    kind: "issue",
    issueNumber: 42,
    issueTitle: "Bug: foo",
    issueBody: "It breaks",
    ...overrides,
  };
}

function prComment(overrides: Partial<PrComment> = {}): PrComment {
  return {
    id: 1,
    author: "alice",
    body: "comment body",
    createdAt: "2026-01-01T00:00:00Z",
    isTrigger: false,
    ...overrides,
  };
}

function prCtx(
  overrides: Partial<PullRequestContext> = {},
): PullRequestContext {
  return {
    kind: "pull_request",
    prNumber: 112,
    prTitle: "feat: walkthrough",
    prBody: "Adds a walkthrough.",
    headRef: "feat/walkthrough",
    baseRef: "main",
    headRepoFullName: "acme/widgets",
    isFork: false,
    triggeringCommentId: 5,
    comments: [],
    ...overrides,
  };
}

function directCtx(overrides: Partial<DirectContext> = {}): DirectContext {
  return {
    kind: "direct",
    prompt: "Add a /healthz endpoint",
    ...overrides,
  };
}

describe("buildTask (issue)", () => {
  it("emits the legacy literal when no triggering comment", () => {
    const out = buildTask(issueCtx());
    expect(out).toBe(
      "Resolve the following GitHub issue:\n\nIssue #42: Bug: foo\n\nIt breaks",
    );
  });

  it("appends a triggering-comment section when present", () => {
    const out = buildTask(
      issueCtx({
        triggeringComment: { id: 7, body: "also handle X", author: "alice" },
      }),
    );
    expect(out).toContain("Resolve the following GitHub issue");
    expect(out).toContain("## Triggering comment from @alice");
    expect(out).toContain("also handle X");
    expect(out).toContain(
      "Treat this comment as the user's most recent intent",
    );
  });

  it("injects an existing-work section listing associated PRs/branches", () => {
    const out = buildTask(
      issueCtx({
        associatedPrs: [
          {
            number: 7,
            url: "https://github.com/acme/widgets/pull/7",
            state: "open",
            headRef: "fix/issue-42",
            baseRef: "main",
            isDraft: true,
            title: "fix: the bug",
          },
        ],
        associatedBranches: ["fix/issue-42"],
      }),
    );
    expect(out).toContain("## Existing work for this issue");
    expect(out).toContain("PR #7");
    expect(out).toContain("(draft)");
    expect(out).toContain("https://github.com/acme/widgets/pull/7");
    expect(out).toContain("`fix/issue-42`");
    expect(out).toContain("CONTINUE from them");
    expect(out).toContain("Only start a new branch if none of these apply");
  });

  it("places the existing-work section before the triggering comment", () => {
    const out = buildTask(
      issueCtx({
        associatedPrs: [
          {
            number: 7,
            url: "https://github.com/acme/widgets/pull/7",
            state: "open",
            headRef: "fix/issue-42",
            baseRef: "main",
            isDraft: false,
            title: "",
          },
        ],
        triggeringComment: { id: 7, body: "also handle X", author: "alice" },
      }),
    );
    expect(out.indexOf("## Existing work for this issue")).toBeLessThan(
      out.indexOf("## Triggering comment"),
    );
  });
});

describe("buildTask (pull_request)", () => {
  it("uses PR framing, not issue framing", () => {
    const out = buildTask(prCtx(), { diffStat: "" });
    expect(out).not.toContain("Resolve the following GitHub issue");
    expect(out).toContain("Continue work on the following pull request");
    expect(out).toContain("PR #112: feat: walkthrough");
    expect(out).toContain("Head branch: feat/walkthrough");
  });

  it("highlights the triggering comment when one is marked", () => {
    const out = buildTask(
      prCtx({
        comments: [
          prComment({ id: 5, author: "bob", body: "fix CI", isTrigger: true }),
        ],
      }),
      { diffStat: "" },
    );
    expect(out).toContain("## Triggering comment from @bob (id: 5)");
    expect(out).toContain("fix CI");
    expect(out).toContain("Do not re-implement existing changes");
  });

  it("renders other comments under a separate section, excluding the trigger", () => {
    const out = buildTask(
      prCtx({
        comments: [
          prComment({ id: 3, author: "alice", body: "looks good" }),
          prComment({ id: 5, author: "bob", body: "fix CI", isTrigger: true }),
        ],
      }),
      { diffStat: "" },
    );
    expect(out).toContain("## Other comments (chronological)");
    expect(out).toContain("**@alice**");
    expect(out).toContain("looks good");
    const otherSection = out.slice(
      out.indexOf("## Other comments"),
      out.indexOf("## Changed files"),
    );
    expect(otherSection).not.toContain("fix CI");
  });

  it("places the triggering comment AFTER the diff stat and git-diff hint (last for recency)", () => {
    const out = buildTask(
      prCtx({
        comments: [
          prComment({ id: 3, author: "alice", body: "looks good" }),
          prComment({ id: 5, author: "bob", body: "fix CI", isTrigger: true }),
        ],
      }),
      { diffStat: " a.go | 10 ++\n1 file changed" },
    );
    const triggerIdx = out.indexOf("## Triggering comment");
    const diffStatIdx = out.indexOf("a.go | 10");
    const gitHintIdx = out.indexOf("Run `git diff");
    const otherCommentsIdx = out.indexOf("## Other comments");
    expect(triggerIdx).toBeGreaterThan(diffStatIdx);
    expect(triggerIdx).toBeGreaterThan(gitHintIdx);
    expect(triggerIdx).toBeGreaterThan(otherCommentsIdx);
  });

  it("omits Other comments section when only the trigger exists", () => {
    const out = buildTask(
      prCtx({
        comments: [prComment({ id: 5, isTrigger: true })],
      }),
      { diffStat: "" },
    );
    expect(out).not.toContain("## Other comments");
  });

  it("emits a fenced diff stat when present", () => {
    const out = buildTask(prCtx(), {
      diffStat: " a.go | 10 ++\n b.go |  5 +-\n2 files changed",
    });
    expect(out).toContain("## Changed files");
    expect(out).toContain("a.go | 10");
    expect(out).toContain("Run `git diff origin/main...HEAD`");
  });

  it("emits a no-changes notice when diff stat is empty", () => {
    const out = buildTask(prCtx(), { diffStat: "" });
    expect(out).toContain("_(no changes on this branch yet)_");
  });

  it("emits a fork notice in the PR header when isFork=true", () => {
    const out = buildTask(
      prCtx({ isFork: true, headRepoFullName: "contributor/widgets" }),
      { diffStat: "" },
    );
    expect(out).toContain("Head lives in a fork: contributor/widgets");
    expect(out).toContain("CANNOT push commits");
  });
});

describe("buildTask (direct)", () => {
  it("wraps the free-text prompt with manual-run framing", () => {
    const out = buildTask(directCtx());
    expect(out).not.toContain("Resolve the following GitHub issue");
    expect(out).not.toContain("Continue work on the following pull request");
    expect(out).toContain("Complete the following task in this repository");
    expect(out).toContain("no associated GitHub issue or pull request");
    expect(out).toContain("Add a /healthz endpoint");
  });
});

describe("buildSystemPrompt (direct)", () => {
  it("uses manual-run framing with branch creation and gh pr create", () => {
    const out = buildSystemPrompt(directCtx(), "");
    expect(out).toContain("manual");
    expect(out).toContain("gh pr create");
    expect(out).toContain("--draft");
    expect(out).toContain("gh pr ready");
    expect(out).toContain("--body-file");
    expect(out).toContain("NOT acceptable");
    expect(out).toContain("infer/");
    expect(out).not.toContain("fix/issue-");
    expect(out).not.toContain("issue #");
  });

  it("appends custom instructions for direct context", () => {
    const out = buildSystemPrompt(directCtx(), "Be concise.");
    expect(out).toContain("## Additional Instructions");
    expect(out).toContain("Be concise.");
  });
});

describe("buildSystemPrompt", () => {
  it("issue variant retains branch-creation and gh pr create steps", () => {
    const out = buildSystemPrompt(issueCtx(), "");
    expect(out).toContain("# GitHub Issue Agent");
    expect(out).toContain("fix/issue-42");
    expect(out).toContain("gh pr create");
    expect(out).toContain("--draft");
    expect(out).toContain("gh pr ready");
    expect(out).toContain("--body-file");
    expect(out).toContain("NOT acceptable");
  });

  it("warns that #N / @name in todos auto-link in the mirrored comment", () => {
    for (const ctx of [issueCtx(), prCtx(), prCtx({ isFork: true })]) {
      const out = buildSystemPrompt(ctx, "");
      expect(out).toContain("pings a real");
      expect(out).toContain("unrelated or non-existent ticket");
    }
  });

  it("omits the auto-link guidance in the direct context (todos not mirrored)", () => {
    const out = buildSystemPrompt(directCtx(), "");
    expect(out).not.toContain("pings a real");
  });

  it("issue variant tells the agent to continue an existing branch, not reset it", () => {
    const out = buildSystemPrompt(issueCtx(), "");
    expect(out).toContain("git fetch origin fix/issue-42");
    expect(out).toContain(
      "Never run `git checkout -B` against an existing branch",
    );
  });

  it("issue and direct variants carry the finish checklist and tool-failure rule", () => {
    for (const ctx of [issueCtx(), directCtx()]) {
      const out = buildSystemPrompt(ctx, "");
      expect(out).toContain("## Before you finish");
      expect(out).toContain("git status -sb");
      expect(out).toContain("gh pr view");
      expect(out).toContain("the change did NOT happen");
    }
  });

  it("PR variant carries the finish check and tool-failure rule", () => {
    const out = buildSystemPrompt(prCtx(), "");
    expect(out).toContain("the change did NOT happen");
    expect(out).toContain('no "[ahead"');
  });

  it("PR variant (non-fork) forbids new branch and new PR", () => {
    const out = buildSystemPrompt(prCtx(), "");
    expect(out).toContain("# GitHub PR Agent");
    expect(out).toContain("ALREADY on branch `feat/walkthrough`");
    expect(out).toContain("DO NOT create a new branch");
    expect(out).toContain("`gh pr create`");
    expect(out).toContain("ALREADY EXISTS (PR #112)");
    expect(out).not.toContain("fix/issue-");
  });

  it("PR variant (fork) is view-only and explicitly forbids commits and pushes", () => {
    const out = buildSystemPrompt(
      prCtx({ isFork: true, headRepoFullName: "contributor/widgets" }),
      "",
    );
    expect(out).toContain("(view-only)");
    expect(out).toContain("DO NOT run `git commit`");
    expect(out).toContain("`git push`");
    expect(out).toContain("contributor/widgets");
    expect(out).not.toContain("gh pr create --base");
    expect(out).not.toContain("fix/issue-");
  });

  it("appends custom instructions for issue context", () => {
    const out = buildSystemPrompt(issueCtx(), "Always use 2-space indents.");
    expect(out).toContain("## Additional Instructions");
    expect(out).toContain("Always use 2-space indents.");
  });

  it("appends custom instructions for PR context", () => {
    const out = buildSystemPrompt(
      prCtx(),
      "Use Conventional Commits strictly.",
    );
    expect(out).toContain("## Additional Instructions");
    expect(out).toContain("Use Conventional Commits strictly.");
  });

  it("does not add Additional Instructions section when custom is empty/whitespace", () => {
    const out = buildSystemPrompt(issueCtx(), "  \n  ");
    expect(out).not.toContain("## Additional Instructions");
  });
});

describe("consumer prompt overrides", () => {
  it("system prompt: INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE replaces the bundled template", () => {
    stubEnv(
      "INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE",
      "CUSTOM ISSUE PROMPT for #{{issueNumber}}",
    );
    const out = buildSystemPrompt(issueCtx({ issueNumber: 7 }), "");
    expect(out).toBe("CUSTOM ISSUE PROMPT for #7");
  });

  it("system prompt: PR override substitutes prNumber and headRef", () => {
    stubEnv(
      "INFER_PROMPT_OVERRIDE_SYSTEM_PR",
      "Work on PR {{prNumber}} branch {{headRef}}",
    );
    const out = buildSystemPrompt(prCtx(), "");
    expect(out).toBe("Work on PR 112 branch feat/walkthrough");
  });

  it("task: INFER_PROMPT_OVERRIDE_TASK_ISSUE replaces the bundled task template", () => {
    stubEnv(
      "INFER_PROMPT_OVERRIDE_TASK_ISSUE",
      "Custom task for #{{issueNumber}}: {{issueTitle}} -- {{issueBody}}{{triggeringCommentSection}}",
    );
    const out = buildTask(issueCtx());
    expect(out).toBe("Custom task for #42: Bug: foo -- It breaks");
  });

  it("system: INFER_PROMPT_OVERRIDE_SYSTEM_DIRECT replaces the bundled template", () => {
    stubEnv("INFER_PROMPT_OVERRIDE_SYSTEM_DIRECT", "CUSTOM DIRECT PROMPT");
    const out = buildSystemPrompt(directCtx(), "");
    expect(out).toBe("CUSTOM DIRECT PROMPT");
  });

  it("task: INFER_PROMPT_OVERRIDE_TASK_DIRECT substitutes the prompt", () => {
    stubEnv("INFER_PROMPT_OVERRIDE_TASK_DIRECT", "RUN: {{prompt}}");
    const out = buildTask(directCtx({ prompt: "ship it" }));
    expect(out).toBe("RUN: ship it");
  });

  it("override is ignored when empty or whitespace-only", () => {
    stubEnv("INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE", "   ");
    const out = buildSystemPrompt(issueCtx(), "");
    expect(out).toContain("# GitHub Issue Agent");
  });

  it("custom instructions are appended even when the prompt is overridden", () => {
    stubEnv(
      "INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE",
      "REPLACEMENT for {{issueNumber}}",
    );
    const out = buildSystemPrompt(issueCtx(), "extra rule");
    expect(out).toBe(
      "REPLACEMENT for 42\n\n## Additional Instructions\n\nextra rule",
    );
  });

  it("throws when an override references an unknown placeholder", () => {
    stubEnv("INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE", "Bad: {{notARealVariable}}");
    expect(() => buildSystemPrompt(issueCtx(), "")).toThrow(/notARealVariable/);
  });

  it("overrides do not leak across contexts (issue override doesn't affect PR)", () => {
    stubEnv("INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE", "ISSUE_CUSTOM");
    const out = buildSystemPrompt(prCtx(), "");
    expect(out).not.toContain("ISSUE_CUSTOM");
    expect(out).toContain("# GitHub PR Agent");
  });
});

describe("systemPromptOverrideWarnings", () => {
  it("returns no diagnostics when no system-prompt override is active", () => {
    expect(systemPromptOverrideWarnings(issueCtx())).toEqual([]);
    expect(systemPromptOverrideWarnings(prCtx())).toEqual([]);
    expect(systemPromptOverrideWarnings(prCtx({ isFork: true }))).toEqual([]);
    expect(systemPromptOverrideWarnings(directCtx())).toEqual([]);
  });

  it("returns no diagnostics when an override carries all git-safety markers", () => {
    stubEnv(
      "INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE",
      "Custom prompt. git commit, git push, gh pr create, gh pr ready, git status -sb.",
    );
    expect(systemPromptOverrideWarnings(issueCtx())).toEqual([]);
  });

  it("flags the issue override when it drops git-safety markers", () => {
    stubEnv(
      "INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE",
      "You are a helpful agent for #{{issueNumber}}. Just answer the question.",
    );
    const diags = systemPromptOverrideWarnings(issueCtx());
    expect(diags).toHaveLength(1);
    expect(diags[0].key).toBe("SYSTEM_ISSUE");
    // All five markers should be missing from the bare override.
    expect(diags[0].missing).toEqual(
      expect.arrayContaining([
        "git commit",
        "git push",
        "gh pr create",
        "gh pr ready",
        "git status",
      ]),
    );
  });

  it("flags only the missing markers, not all of them", () => {
    stubEnv(
      "INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE",
      "git commit your work, then git push to the branch. git status -sb at the end.",
    );
    const diags = systemPromptOverrideWarnings(issueCtx());
    expect(diags).toHaveLength(1);
    expect(diags[0].missing).toEqual(
      expect.arrayContaining(["gh pr create", "gh pr ready"]),
    );
    expect(diags[0].missing).not.toContain("git commit");
    expect(diags[0].missing).not.toContain("git push");
    expect(diags[0].missing).not.toContain("git status");
  });

  it("flags the direct override when it lacks the full git-safety block", () => {
    stubEnv("INFER_PROMPT_OVERRIDE_SYSTEM_DIRECT", "Just write the code.");
    const diags = systemPromptOverrideWarnings(directCtx());
    expect(diags).toHaveLength(1);
    expect(diags[0].key).toBe("SYSTEM_DIRECT");
    expect(diags[0].missing.length).toBeGreaterThan(0);
  });

  it("flags the same-repo PR override when it drops commit/push/finish", () => {
    stubEnv(
      "INFER_PROMPT_OVERRIDE_SYSTEM_PR",
      "Review the PR #{{prNumber}} on branch {{headRef}}.",
    );
    const diags = systemPromptOverrideWarnings(prCtx());
    expect(diags).toHaveLength(1);
    expect(diags[0].key).toBe("SYSTEM_PR");
    expect(diags[0].missing).toEqual(
      expect.arrayContaining(["git commit", "git push", "git status"]),
    );
  });

  it("flags the fork-PR override when it drops the do-not-commit guard", () => {
    stubEnv(
      "INFER_PROMPT_OVERRIDE_SYSTEM_PR_FORK",
      "Answer questions about PR #{{prNumber}}.",
    );
    const diags = systemPromptOverrideWarnings(prCtx({ isFork: true }));
    expect(diags).toHaveLength(1);
    expect(diags[0].key).toBe("SYSTEM_PR_FORK");
    expect(diags[0].missing).toEqual(
      expect.arrayContaining(["git commit", "git push"]),
    );
  });

  it("does not flag a fork-PR override that restates the do-not-commit guard", () => {
    stubEnv(
      "INFER_PROMPT_OVERRIDE_SYSTEM_PR_FORK",
      "Do NOT run `git commit` or `git push` - this is a fork PR.",
    );
    expect(systemPromptOverrideWarnings(prCtx({ isFork: true }))).toEqual([]);
  });

  it("ignores whitespace-only overrides (bundled default is in effect)", () => {
    stubEnv("INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE", "   \n  ");
    expect(systemPromptOverrideWarnings(issueCtx())).toEqual([]);
  });

  it("only inspects the override for the active context, not other keys", () => {
    stubEnv(
      "INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE",
      "Just answer the question for #{{issueNumber}}.",
    );
    expect(systemPromptOverrideWarnings(prCtx())).toEqual([]);
    expect(systemPromptOverrideWarnings(directCtx())).toEqual([]);
  });
});

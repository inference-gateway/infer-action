import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  IssueContext,
  PrComment,
  PullRequestContext,
} from "../src/context.js";
import { buildReminder, buildSystemPrompt, buildTask } from "../src/prompts.js";

afterEach(() => {
  vi.unstubAllEnvs();
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

describe("buildSystemPrompt", () => {
  it("issue variant retains branch-creation and gh pr create steps", () => {
    const out = buildSystemPrompt(issueCtx(), "");
    expect(out).toContain("# GitHub Issue Agent");
    expect(out).toContain("fix/issue-42");
    expect(out).toContain("gh pr create");
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

describe("buildReminder", () => {
  it("issue variant tells agent to open a PR with gh pr create", () => {
    const out = buildReminder(issueCtx());
    expect(out).toContain("<system-reminder>");
    expect(out).toContain("</system-reminder>");
    expect(out).toContain("work on a non-main branch");
    expect(out).toContain("gh pr create");
  });

  it("PR variant (non-fork) tells agent to stay on head branch and not create a new PR", () => {
    const out = buildReminder(prCtx());
    expect(out).toContain("<system-reminder>");
    expect(out).toContain("PR #112");
    expect(out).toContain("ALREADY on the PR's head branch `feat/walkthrough`");
    expect(out).toContain("do NOT create a new branch");
    expect(out).toContain("do NOT run `gh pr create`");
    expect(out).not.toContain("non-main branch");
  });

  it("PR variant (fork) tells agent it cannot commit or push", () => {
    const out = buildReminder(prCtx({ isFork: true }));
    expect(out).toContain("<system-reminder>");
    expect(out).toContain("CANNOT commit or push");
    expect(out).toContain("git diff origin/main...HEAD");
    expect(out).not.toContain("gh pr create`, your pushes update it");
  });

  it("emits a single line per reminder (no embedded newlines)", () => {
    for (const ctx of [issueCtx(), prCtx(), prCtx({ isFork: true })]) {
      const out = buildReminder(ctx);
      expect(out.includes("\n")).toBe(false);
    }
  });
});

describe("consumer prompt overrides", () => {
  it("system prompt: INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE replaces the bundled template", () => {
    vi.stubEnv(
      "INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE",
      "CUSTOM ISSUE PROMPT for #{{issueNumber}}",
    );
    const out = buildSystemPrompt(issueCtx({ issueNumber: 7 }), "");
    expect(out).toBe("CUSTOM ISSUE PROMPT for #7");
  });

  it("system prompt: PR override substitutes prNumber and headRef", () => {
    vi.stubEnv(
      "INFER_PROMPT_OVERRIDE_SYSTEM_PR",
      "Work on PR {{prNumber}} branch {{headRef}}",
    );
    const out = buildSystemPrompt(prCtx(), "");
    expect(out).toBe("Work on PR 112 branch feat/walkthrough");
  });

  it("reminder: INFER_PROMPT_OVERRIDE_REMINDER_PR replaces the bundled reminder", () => {
    vi.stubEnv(
      "INFER_PROMPT_OVERRIDE_REMINDER_PR",
      "<system-reminder>custom for {{prNumber}}/{{headRef}}</system-reminder>",
    );
    const out = buildReminder(prCtx());
    expect(out).toBe(
      "<system-reminder>custom for 112/feat/walkthrough</system-reminder>",
    );
  });

  it("task: INFER_PROMPT_OVERRIDE_TASK_ISSUE replaces the bundled task template", () => {
    vi.stubEnv(
      "INFER_PROMPT_OVERRIDE_TASK_ISSUE",
      "Custom task for #{{issueNumber}}: {{issueTitle}} -- {{issueBody}}{{triggeringCommentSection}}",
    );
    const out = buildTask(issueCtx());
    expect(out).toBe("Custom task for #42: Bug: foo -- It breaks");
  });

  it("override is ignored when empty or whitespace-only", () => {
    vi.stubEnv("INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE", "   ");
    const out = buildSystemPrompt(issueCtx(), "");
    expect(out).toContain("# GitHub Issue Agent");
  });

  it("custom instructions are appended even when the prompt is overridden", () => {
    vi.stubEnv(
      "INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE",
      "REPLACEMENT for {{issueNumber}}",
    );
    const out = buildSystemPrompt(issueCtx(), "extra rule");
    expect(out).toBe(
      "REPLACEMENT for 42\n\n## Additional Instructions\n\nextra rule",
    );
  });

  it("throws when an override references an unknown placeholder", () => {
    vi.stubEnv(
      "INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE",
      "Bad: {{notARealVariable}}",
    );
    expect(() => buildSystemPrompt(issueCtx(), "")).toThrow(/notARealVariable/);
  });

  it("overrides do not leak across contexts (issue override doesn't affect PR)", () => {
    vi.stubEnv("INFER_PROMPT_OVERRIDE_SYSTEM_ISSUE", "ISSUE_CUSTOM");
    const out = buildSystemPrompt(prCtx(), "");
    expect(out).not.toContain("ISSUE_CUSTOM");
    expect(out).toContain("# GitHub PR Agent");
  });
});

import type {
  DirectContext,
  IssueContext,
  PrComment,
  PullRequestContext,
  ReviewCommentFocus,
  TaskContext,
} from "./context.js";
import { PROMPTS, type PromptKey } from "./prompts.gen.js";

type RenderVars = Record<string, string | number>;

// Resolve the template for a key: a non-empty INFER_PROMPT_OVERRIDE_<KEY> env
// value wins; otherwise the bundled default from prompts.gen.ts. Read at call
// time so tests can stub process.env without re-importing the module.
function templateFor(key: PromptKey): string {
  const override = process.env[`INFER_PROMPT_OVERRIDE_${key}`];
  return override && override.trim() ? override : PROMPTS[key];
}

// Returns the raw override value for a key, or null when the bundled default is
// in effect (env unset / whitespace-only). Read live so tests can stub env.
function overrideFor(key: PromptKey): string | null {
  const v = process.env[`INFER_PROMPT_OVERRIDE_${key}`];
  return v && v.trim() ? v : null;
}

// Substrings the bundled system prompts use to carry the git-safety guard: the
// branch-first / commit-per-todo / push discipline, the draft-PR step, and the
// finish checklist (or, for fork PRs, the explicit do-not-commit prohibition).
// An override missing any of its context's markers has silently dropped that
// guard, reintroducing the lost-work failure mode the defaults protect against.
const GIT_SAFETY_MARKERS: Partial<Record<PromptKey, readonly string[]>> = {
  SYSTEM_ISSUE: [
    "git commit",
    "git push",
    "gh pr create",
    "gh pr ready",
    "git status",
  ],
  SYSTEM_DIRECT: [
    "git commit",
    "git push",
    "gh pr create",
    "gh pr ready",
    "git status",
  ],
  // Same-repo PR: the PR already exists (no gh pr create / gh pr ready), but the
  // commit/push discipline and the "no [ahead" finish check still apply.
  SYSTEM_PR: ["git commit", "git push", "git status"],
  // Fork PR is view-only: the guard is the explicit prohibition, whose text
  // mentions both git commit and git push. A bare "answer the question" override
  // drops that guard, so flag it.
  SYSTEM_PR_FORK: ["git commit", "git push"],
};

// The system-prompt key that applies for a given run context.
function systemPromptKeyFor(ctx: TaskContext): PromptKey {
  if (ctx.kind === "issue") return "SYSTEM_ISSUE";
  if (ctx.kind === "direct") return "SYSTEM_DIRECT";
  if (ctx.isFork) return "SYSTEM_PR_FORK";
  return "SYSTEM_PR";
}

export interface OverrideDiagnostic {
  key: PromptKey;
  missing: readonly string[];
}

// Returns one diagnostic per system-prompt override that is active for ctx but
// is missing git-safety markers. Empty when no override is active or the
// override carries the safety block. Pure (reads process.env); the runner turns
// each entry into a `::warning::` workflow annotation.
export function systemPromptOverrideWarnings(
  ctx: TaskContext,
): OverrideDiagnostic[] {
  const key = systemPromptKeyFor(ctx);
  const override = overrideFor(key);
  if (override === null) return [];
  const markers = GIT_SAFETY_MARKERS[key];
  if (!markers || markers.length === 0) return [];
  const missing = markers.filter((m) => !override.includes(m));
  return missing.length > 0 ? [{ key, missing }] : [];
}

// Strict {{name}} substitution. Throws on missing variables so a typo in a
// placeholder name surfaces as a runtime error instead of silently emitting
// an empty string.
export function render(key: PromptKey, vars: RenderVars = {}): string {
  return templateFor(key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!(name in vars)) {
      throw new Error(`Missing variable "${name}" for prompt "${key}"`);
    }
    return String(vars[name]);
  });
}

export interface BuildTaskOptions {
  diffStat?: string;
}

export function buildTask(
  ctx: TaskContext,
  opts: BuildTaskOptions = {},
): string {
  if (ctx.kind === "issue") return buildIssueTask(ctx);
  if (ctx.kind === "direct") return buildDirectTask(ctx);
  return buildPullRequestTask(ctx, opts.diffStat ?? "");
}

export function buildSystemPrompt(
  ctx: TaskContext,
  customInstructions: string,
): string {
  const base = renderSystemPrompt(ctx);
  if (customInstructions.trim()) {
    return `${base}\n\n## Additional Instructions\n\n${customInstructions}`;
  }
  return base;
}

function renderSystemPrompt(ctx: TaskContext): string {
  if (ctx.kind === "issue") {
    return render("SYSTEM_ISSUE", { issueNumber: ctx.issueNumber });
  }
  if (ctx.kind === "direct") {
    return render("SYSTEM_DIRECT");
  }
  if (ctx.isFork) {
    return render("SYSTEM_PR_FORK", {
      prNumber: ctx.prNumber,
      headRef: ctx.headRef,
      headRepoFullName: ctx.headRepoFullName,
      baseRef: ctx.baseRef,
    });
  }
  return render("SYSTEM_PR", {
    prNumber: ctx.prNumber,
    headRef: ctx.headRef,
  });
}

function buildDirectTask(ctx: DirectContext): string {
  return render("TASK_DIRECT", { prompt: ctx.prompt });
}

function buildIssueTask(ctx: IssueContext): string {
  const triggeringCommentSection = ctx.triggeringComment
    ? `\n\n## Triggering comment from @${ctx.triggeringComment.author}\n\n${ctx.triggeringComment.body}\n\nTreat this comment as the user's most recent intent. If it asks for something more specific than the issue body, prioritise it.`
    : "";
  return render("TASK_ISSUE", {
    issueNumber: ctx.issueNumber,
    issueTitle: ctx.issueTitle,
    issueBody: ctx.issueBody,
    existingWorkSection: buildExistingWorkSection(ctx),
    recentCommentsSection: buildRecentCommentsSection(
      (ctx.threadComments ?? []).filter((c) => !c.isTrigger),
      "Recent comments (chronological)",
    ),
    triggeringCommentSection,
  });
}

// Renders the newest few human comments of a thread, with a one-line omission
// note for the rest, so long discussions don't flood the task prompt. The
// caller excludes the trigger comment (it gets its own section). Bots are
// filtered first - the action's own "I'm cooking..." comment is always the
// newest comment on the thread when this runs.
function buildRecentCommentsSection(
  comments: PrComment[],
  heading: string,
): string {
  const visible = comments.filter((c) => !c.author.endsWith("[bot]"));
  const recent = visible.slice(-3);
  if (recent.length === 0) return "";
  const omitted = visible.length - recent.length;
  const omittedLine =
    omitted > 0
      ? `_…${omitted} earlier comment${omitted === 1 ? "" : "s"} omitted_\n\n`
      : "";
  return `\n\n## ${heading}\n\n${omittedLine}${recent.map(renderComment).join("\n\n")}`;
}

// Renders the "Existing work for this issue" block injected into TASK_ISSUE,
// before the triggering-comment section so the user's most recent intent stays
// last. Empty string when there are no associations (keeps the no-association
// task byte-identical to before). Tells the agent to continue from the listed
// branches/PRs rather than start fresh - the relevance call is the agent's; the
// runner never checks anything out.
function buildExistingWorkSection(ctx: IssueContext): string {
  const prs = ctx.associatedPrs ?? [];
  const branches = ctx.associatedBranches ?? [];
  if (prs.length === 0 && branches.length === 0) return "";

  const parts: string[] = [
    "## Existing work for this issue",
    "A prior run or another contributor may already have started on this issue. " +
      "Before creating a branch, inspect the items below and CONTINUE from them if " +
      "they contain relevant work - check it out (`gh pr checkout <number>`, or " +
      "`git fetch origin <branch> && git checkout <branch>`) and build on top of it " +
      "rather than starting fresh. Only start a new branch if none of these apply.",
  ];
  if (prs.length) {
    const lines = prs.map((p) => {
      const draft = p.isDraft ? " (draft)" : "";
      const state = p.state && p.state !== "open" ? ` [${p.state}]` : "";
      const branch = p.headRef ? ` - branch \`${p.headRef}\`` : "";
      const title = p.title ? ` - ${p.title}` : "";
      return `- PR #${p.number}${draft}${state}${branch}: ${p.url}${title}`;
    });
    parts.push("### Pull requests\n\n" + lines.join("\n"));
  }
  if (branches.length) {
    parts.push(
      "### Branches\n\n" + branches.map((b) => `- \`${b}\``).join("\n"),
    );
  }
  return "\n\n" + parts.join("\n\n");
}

function buildPullRequestTask(
  ctx: PullRequestContext,
  diffStat: string,
): string {
  const forkNotice = ctx.isFork
    ? `\nHead lives in a fork: ${ctx.headRepoFullName}. You CANNOT push commits to it from this runner.`
    : "";

  const trigger = ctx.comments.find((c) => c.isTrigger);
  const triggerSection = trigger
    ? `\n\n## Triggering comment from @${trigger.author} (id: ${trigger.id})\n\n${trigger.body}\n\nThis is the user's most recent ask. Address it directly. Do not re-implement existing changes unless this comment asks for that.`
    : "";

  const others = ctx.comments.filter((c) => !c.isTrigger);

  if (ctx.reviewComment) {
    return buildPullRequestReviewTask(ctx, ctx.reviewComment, {
      forkNotice,
      triggerSection,
      others,
    });
  }

  const otherCommentsSection = buildRecentCommentsSection(
    others,
    "Other comments (chronological)",
  );

  const prBody = ctx.prBody.trim() ? ctx.prBody : "_(no description)_";

  const diffStatSection = diffStat.trim()
    ? "```\n" + diffStat.trim() + "\n```"
    : "_(no changes on this branch yet)_";

  return render("TASK_PR", {
    prNumber: ctx.prNumber,
    prTitle: ctx.prTitle,
    headRef: ctx.headRef,
    baseRef: ctx.baseRef,
    forkNotice,
    prBody,
    triggerSection,
    otherCommentsSection,
    diffStatSection,
  });
}

// The focused task for an inline review-comment trigger: the code section
// (file, line, diff hunk) plus its review thread - never the PR conversation.
function buildPullRequestReviewTask(
  ctx: PullRequestContext,
  rc: ReviewCommentFocus,
  parts: { forkNotice: string; triggerSection: string; others: PrComment[] },
): string {
  const lineInfo =
    rc.startLine && rc.line && rc.startLine !== rc.line
      ? `, lines ${rc.startLine}-${rc.line}`
      : rc.line
        ? `, line ${rc.line}`
        : "";
  const threadSection =
    parts.others.length > 0
      ? `\n\n## Earlier comments in this review thread\n\n${parts.others.map(renderComment).join("\n\n")}`
      : "";
  return render("TASK_PR_REVIEW", {
    prNumber: ctx.prNumber,
    prTitle: ctx.prTitle,
    headRef: ctx.headRef,
    baseRef: ctx.baseRef,
    forkNotice: parts.forkNotice,
    filePath: rc.path,
    lineInfo,
    diffHunk: rc.diffHunk,
    threadSection,
    triggerSection: parts.triggerSection,
  });
}

function renderComment(c: PrComment): string {
  return `**@${c.author}** · ${c.createdAt}\n\n${c.body}`;
}

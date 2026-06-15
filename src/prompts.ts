import type {
  DirectContext,
  IssueContext,
  PrComment,
  PullRequestContext,
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

// Used by the runner to set INFER_PROMPTS_AGENT_SYSTEM_REMINDERS_REMINDER_TEXT
// so the periodic reminder injected mid-stream matches the context the agent
// is actually operating in (issue vs PR vs fork PR).
export function buildReminder(ctx: TaskContext): string {
  if (ctx.kind === "issue") return render("REMINDER_ISSUE");
  if (ctx.kind === "direct") return render("REMINDER_DIRECT");
  if (ctx.isFork) return render("REMINDER_PR_FORK", { baseRef: ctx.baseRef });
  return render("REMINDER_PR", {
    prNumber: ctx.prNumber,
    headRef: ctx.headRef,
  });
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
    triggeringCommentSection,
  });
}

// Renders the "Existing work for this issue" block injected into TASK_ISSUE,
// before the triggering-comment section so the user's most recent intent stays
// last. Empty string when there are no associations (keeps the no-association
// task byte-identical to before). Tells the agent to continue from the listed
// branches/PRs rather than start fresh — the relevance call is the agent's; the
// runner never checks anything out.
function buildExistingWorkSection(ctx: IssueContext): string {
  const prs = ctx.associatedPrs ?? [];
  const branches = ctx.associatedBranches ?? [];
  if (prs.length === 0 && branches.length === 0) return "";

  const parts: string[] = [
    "## Existing work for this issue",
    "A prior run or another contributor may already have started on this issue. " +
      "Before creating a branch, inspect the items below and CONTINUE from them if " +
      "they contain relevant work — check it out (`gh pr checkout <number>`, or " +
      "`git fetch origin <branch> && git checkout <branch>`) and build on top of it " +
      "rather than starting fresh. Only start a new branch if none of these apply.",
  ];
  if (prs.length) {
    const lines = prs.map((p) => {
      const draft = p.isDraft ? " (draft)" : "";
      const state = p.state && p.state !== "open" ? ` [${p.state}]` : "";
      const branch = p.headRef ? ` — branch \`${p.headRef}\`` : "";
      const title = p.title ? ` — ${p.title}` : "";
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
  const otherCommentsSection =
    others.length > 0
      ? `\n\n## Other comments (chronological)\n\n${others.map(renderComment).join("\n\n")}`
      : "";

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

function renderComment(c: PrComment): string {
  return `**@${c.author}** · ${c.createdAt}\n\n${c.body}`;
}

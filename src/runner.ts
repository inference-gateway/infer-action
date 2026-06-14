#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, createWriteStream } from "node:fs";
import { PassThrough } from "node:stream";
import type { PullRequestContext, TaskContext } from "./context.js";
import { loadContext } from "./context.js";
import { composeBashAllowAppend } from "./bash-allow.js";
import { GithubClient, SPINNER_BLOCK } from "./github.js";
import { readJsonLines } from "./parser.js";
import { buildPrBody, isThinPrBody } from "./pr-body.js";
import { buildReminder, buildSystemPrompt, buildTask } from "./prompts.js";
import {
  collectSecretValues,
  createRedactor,
  emitAddMaskDirectives,
  SECRET_ENV_NAMES,
} from "./redact.js";
import { Ticker, throttleLatest } from "./ticker.js";
import type { InnerToolResult, Todo } from "./types.js";
import { formatDuration } from "./duration.js";

const AGENT_OUTPUT_PATH = "/tmp/agent-output.txt";
const TICKER_DEBOUNCE_MS = 1500;

async function main(): Promise<number> {
  const dryRun = optional("INFER_DRY_RUN") === "true";
  const token = dryRun ? optional("GITHUB_TOKEN") : required("GITHUB_TOKEN");
  const repo = required("INFER_REPO");
  const cookingCommentIdRaw = optional("INFER_COOKING_COMMENT_ID");
  const cookingCommentId = cookingCommentIdRaw
    ? Number.parseInt(cookingCommentIdRaw, 10)
    : 0;
  const hasCookingComment =
    Number.isFinite(cookingCommentId) && cookingCommentId > 0;
  const model = required("INFER_AGENT_MODEL");
  const customInstructions = optional("INFER_CUSTOM_INSTRUCTIONS");
  const enableGitOps = optional("INFER_ENABLE_GIT_OPERATIONS") !== "false";
  const extraBashAllow = optional("INFER_BASH_ALLOW_APPEND");
  const enableHeuristics = optional("INFER_REDACT_HEURISTICS") === "true";
  const mirrorAgentLogs = optional("INFER_MIRROR_AGENT_LOGS") !== "false";

  const secretValues = collectSecretValues(process.env, SECRET_ENV_NAMES);
  emitAddMaskDirectives(secretValues);
  const redactor = createRedactor({
    env: process.env,
    heuristics: enableHeuristics,
  });

  const github = new GithubClient({ token, repo, redactor, dryRun });

  let ctx: TaskContext;
  try {
    ctx = await loadContext(process.env, github);
  } catch (e) {
    if (!dryRun) throw e;
    console.warn(
      `[dry-run] context read failed (${(e as Error).message}); proceeding with env-derived data`,
    );
    ctx = loadFallbackContext(process.env);
  }

  if (ctx.kind === "pull_request" && enableGitOps) {
    ensurePrHeadCheckedOut(ctx);
  }

  const diffStat =
    ctx.kind === "pull_request" ? collectDiffStat(ctx.baseRef) : "";

  const systemPrompt = buildSystemPrompt(ctx, customInstructions);
  const task = buildTask(ctx, { diffStat });
  const reminder = buildReminder(ctx);

  const bashAllowAppend = composeBashAllowAppend(enableGitOps, extraBashAllow);

  const inferBin = optional("INFER_BIN") || "infer";

  console.log("==========================================");
  console.log("SYSTEM PROMPT:");
  console.log("==========================================");
  console.log(systemPrompt);
  console.log("==========================================");
  console.log("");
  console.log("Running agent with task:");
  console.log(task);
  console.log("---");

  if (dryRun) {
    console.log("==========================================");
    console.log("DRY RUN — the agent would be invoked with:");
    console.log("==========================================");
    console.log(`Model:        ${model}`);
    console.log(`Context kind: ${ctx.kind}`);
    console.log(`Git ops:      ${enableGitOps ? "enabled" : "disabled"}`);
    console.log(`INFER_BIN:    ${inferBin}`);
    console.log("--- REMINDER ---");
    console.log(reminder);
    console.log(
      "--- BASH ALLOW-LIST APPEND (added to the CLI read-only baseline) ---",
    );
    console.log(bashAllowAppend || "(none — CLI read-only baseline only)");
    console.log("==========================================");
  }

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    INFER_AGENT_SYSTEM_PROMPT: systemPrompt,
    INFER_PROMPTS_AGENT_SYSTEM_REMINDERS_REMINDER_TEXT: reminder,
    INFER_TOOLS_BASH_ALLOW_APPEND: bashAllowAppend,
  };

  const agentStartTime = Date.now();

  const child = spawn(inferBin, ["agent", "-m", model, task], {
    stdio: ["inherit", "pipe", "pipe"],
    env: childEnv,
  });

  if (!child.stdout || !child.stderr) {
    throw new Error("child stdio not piped - this should not happen");
  }

  const fileTee = createWriteStream(AGENT_OUTPUT_PATH);
  const lineFeed = new PassThrough();

  child.stdout.pipe(fileTee, { end: false });
  if (mirrorAgentLogs) {
    child.stdout.pipe(process.stdout, { end: false });
  } else {
    console.log(
      "[runner] agent logs muted (INFER_MIRROR_AGENT_LOGS=false); transcript is written to /tmp/agent-output.txt only",
    );
  }
  child.stdout.pipe(lineFeed);
  child.stdout.on("end", () => fileTee.end());

  child.stderr.on("data", (chunk: Buffer) => {
    fileTee.write(chunk);
    if (mirrorAgentLogs) {
      process.stderr.write(chunk);
    }
  });

  const ticker = new Ticker();
  if (hasCookingComment) {
    const throttledTodos = throttleLatest<Todo[]>(async (todos) => {
      const markdown = renderPlan(todos);
      try {
        await github.updateZone(cookingCommentId, "plan", markdown);
        console.log(`[ticker] updated plan section (${todos.length} todos)`);
      } catch (e) {
        console.error("[ticker] PATCH failed:", e);
      }
    }, TICKER_DEBOUNCE_MS);
    ticker.addFlusher(throttledTodos.flush);

    ticker.on("TodoWrite", (inner: InnerToolResult) => {
      const todos = inner.data?.todos;
      if (Array.isArray(todos)) throttledTodos.call(todos);
    });
  } else {
    console.log(
      "[ticker] no cooking comment; plan mirroring disabled (direct mode)",
    );
  }

  await ticker.observe(readJsonLines(lineFeed));
  await ticker.flush();

  const exitCode = await waitForExit(child);
  const durationMs = Date.now() - agentStartTime;

  console.log("");
  console.log("==========================================");
  console.log(`Agent exited with code ${exitCode}`);
  console.log(`Duration: ${formatDuration(durationMs)}`);
  console.log("==========================================");

  if (enableGitOps) {
    try {
      await linkAgentPr({
        github,
        cookingCommentId,
        hasCookingComment,
        dryRun,
        canBackfill: ctx.kind === "issue" || ctx.kind === "direct",
        issueNumber: ctx.kind === "issue" ? ctx.issueNumber : undefined,
      });
    } catch (e) {
      console.error("[pr-link] failed:", e);
    }
  } else {
    console.log("[pr-link] git operations disabled, skipping");
  }

  setOutput("exit-code", String(exitCode));
  setOutput("run-duration-ms", String(durationMs));
  setOutput(
    "result",
    exitCode === 0
      ? "Agent completed successfully"
      : `Agent failed with exit code ${exitCode}`,
  );

  return exitCode;
}

function renderPlan(todos: Todo[]): string {
  if (todos.length === 0) {
    return `${SPINNER_BLOCK}\n\n### Todos\n\n_(agent has not posted a plan yet)_`;
  }
  const lines = todos.map((t) => {
    const checkbox =
      t.status === "completed"
        ? "[x]"
        : t.status === "in_progress"
          ? "[~]"
          : "[ ]";
    return `- ${checkbox} ${t.content}`;
  });
  return [SPINNER_BLOCK, "", "### Todos", "", ...lines].join("\n");
}

function ensurePrHeadCheckedOut(ctx: PullRequestContext): void {
  try {
    if (ctx.isFork) {
      const localBranch = `pr-${ctx.prNumber}`;
      console.log(
        `[runner] fork PR; fetching pull/${ctx.prNumber}/head into ${localBranch}`,
      );
      sh(`git fetch origin pull/${ctx.prNumber}/head:${localBranch}`);
      sh(`git checkout ${localBranch}`);
    } else {
      console.log(`[runner] checking out PR head branch ${ctx.headRef}`);
      sh(`git fetch origin ${ctx.headRef}`);
      sh(`git checkout ${ctx.headRef}`);
    }
  } catch (e) {
    throw new Error(
      `Failed to check out PR head (${ctx.headRef}). Aborting before spawning the agent so it doesn't run against the wrong branch.`,
      { cause: e },
    );
  }
}

function collectDiffStat(baseRef: string): string {
  try {
    return sh(`git diff --stat origin/${baseRef}...HEAD`);
  } catch (e) {
    console.error("[runner] git diff --stat failed:", e);
    return "";
  }
}

async function waitForExit(child: ReturnType<typeof spawn>): Promise<number> {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
  });
}

// The agent owns PR creation (see system prompt step 3). The runner does not
// open or fall back to opening a PR; it only surfaces the PR the agent opened.
// In event-driven mode it links the PR in the cooking comment; in direct mode
// (no comment) it writes the link to the job summary. Either way it exports the
// URL as the `pr-url` step output. If no PR exists, there is nothing to link.
//
// Safety net: weaker models sometimes open the PR with a thin body (e.g. a bare
// "Fixes #N"). When `canBackfill` (issue/direct runs, where the agent created the
// PR) and the body is thin, the runner rewrites it from the commit log via the
// API — model-independent, and not subject to the agent's bash allow-list.
async function linkAgentPr(args: {
  github: GithubClient;
  cookingCommentId: number;
  hasCookingComment: boolean;
  dryRun: boolean;
  canBackfill: boolean;
  issueNumber: number | undefined;
}): Promise<void> {
  const branch = sh("git branch --show-current").trim();
  if (
    !branch ||
    branch === "main" ||
    branch === "master" ||
    branch === "HEAD"
  ) {
    console.log(`[pr-link] on ${branch || "detached HEAD"}, nothing to link`);
    return;
  }

  const pr = await args.github.getOpenPrForBranch(branch);
  if (!pr) {
    if (args.dryRun) {
      console.log(
        `[dry-run] the agent would open a PR for branch ${branch} (none exists in dry-run)`,
      );
    } else {
      console.log(
        `[pr-link] no open PR found for ${branch}; the agent owns PR creation`,
      );
    }
    return;
  }

  if (args.canBackfill && isThinPrBody(pr.body)) {
    try {
      const body = buildPrBody({
        commitSubjects: collectCommitSubjects(pr.baseRef),
        diffStat: collectDiffStat(pr.baseRef),
        issueNumber: args.issueNumber,
      });
      await args.github.updatePullRequestBody(pr.number, body);
      console.log(`[pr-link] backfilled thin PR body for #${pr.number}`);
    } catch (e) {
      console.error("[pr-link] failed to backfill PR body:", e);
    }
  }

  setOutput("pr-url", pr.url);
  console.log(`[pr-link] linking PR: ${pr.url}`);
  if (args.hasCookingComment) {
    await appendPrToComment(args.github, args.cookingCommentId, pr.url);
  } else {
    appendStepSummary(`### 🔀 Pull Request\n\n${pr.url}`);
    console.log("[pr-link] wrote PR link to job summary (direct mode)");
  }
}

// Commit subjects on the current branch since it diverged from origin/<base>,
// newest last. Used to synthesise a PR body when the agent left a thin one.
function collectCommitSubjects(baseRef: string): string[] {
  try {
    return sh(`git log origin/${baseRef}..HEAD --format=%s`)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (e) {
    console.error("[pr-link] git log failed:", e);
    return [];
  }
}

// Appends a markdown block to the GitHub Actions job summary. In direct mode
// this is the surface for the PR link (post-results appends the result footer
// below it); both writers only ever append, so GitHub concatenates them.
function appendStepSummary(markdown: string): void {
  const file = process.env["GITHUB_STEP_SUMMARY"];
  if (!file) {
    console.log(`(would append step summary)\n${markdown}`);
    return;
  }
  appendFileSync(file, `${markdown}\n`);
}

async function appendPrToComment(
  github: GithubClient,
  commentId: number,
  prUrl: string,
): Promise<void> {
  const middle = `### Pull Request\n\n${prUrl}`;
  try {
    await github.updateZone(commentId, "middle", middle);
  } catch (e) {
    console.error("[pr-link] failed to update comment with PR URL:", e);
  }
}

function sh(cmd: string): string {
  return execFileSync("bash", ["-c", cmd], { encoding: "utf8" });
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var ${name}`);
  }
  return v;
}

function optional(name: string): string {
  return process.env[name] ?? "";
}

// Dry-run only: build a minimal TaskContext purely from env when a network read
// in loadContext fails (the pull_request kind is the only one that reads). Lets
// a tokenless/offline dry-run still surface the prompts instead of crashing.
function loadFallbackContext(env: NodeJS.ProcessEnv): TaskContext {
  const kind = env["INFER_CONTEXT_KIND"];
  if (kind === "direct") {
    return {
      kind: "direct",
      prompt:
        (env["INFER_DIRECT_PROMPT"] ?? "").trim() || "(dry-run: no prompt)",
    };
  }
  if (kind === "pull_request") {
    return {
      kind: "pull_request",
      prNumber: Number.parseInt(env["INFER_ISSUE_NUMBER"] ?? "0", 10) || 0,
      prTitle: "(dry-run: PR title unavailable)",
      prBody: "",
      headRef: "(unknown)",
      baseRef: "main",
      headRepoFullName: "",
      isFork: false,
      triggeringCommentId: 0,
      comments: [],
    };
  }
  return {
    kind: "issue",
    issueNumber: Number.parseInt(env["INFER_ISSUE_NUMBER"] ?? "0", 10) || 0,
    issueTitle: env["INFER_ISSUE_TITLE"] ?? "",
    issueBody: env["INFER_ISSUE_BODY"] ?? "",
  };
}

function setOutput(name: string, value: string): void {
  const file = process.env["GITHUB_OUTPUT"];
  if (!file) {
    console.log(`(would set output) ${name}=${value}`);
    return;
  }
  if (value.includes("\n")) {
    const eof = `_GHO_EOF_${Math.random().toString(36).slice(2)}`;
    appendFileSync(file, `${name}<<${eof}\n${value}\n${eof}\n`);
  } else {
    appendFileSync(file, `${name}=${value}\n`);
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error("[runner] uncaught error:", e);
    process.exit(1);
  },
);

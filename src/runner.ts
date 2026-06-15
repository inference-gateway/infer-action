#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, createWriteStream } from "node:fs";
import { PassThrough } from "node:stream";
import type { PullRequestContext, TaskContext } from "./context.js";
import { loadContext } from "./context.js";
import { composeBashAllowAppend } from "./bash-allow.js";
import type { OpenPr } from "./github.js";
import { GithubClient, SPINNER_BLOCK } from "./github.js";
import { planLogMirroring } from "./log-mirror.js";
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
  const workflowUrl = optional("INFER_WORKFLOW_URL");
  const model = required("INFER_AGENT_MODEL");
  const customInstructions = optional("INFER_CUSTOM_INSTRUCTIONS");
  const enableGitOps = optional("INFER_ENABLE_GIT_OPERATIONS") !== "false";
  const extraBashAllow = optional("INFER_BASH_ALLOW_APPEND");
  const enableHeuristics = optional("INFER_REDACT_HEURISTICS") === "true";
  const mirror = planLogMirroring(process.env);

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
  if (mirror.stdout) {
    child.stdout.pipe(process.stdout, { end: false });
  } else {
    console.log(
      "[runner] agent stdout muted (set INFER_MIRROR_AGENT_LOGS=true to mirror); stderr still shown, full transcript written to /tmp/agent-output.txt",
    );
  }
  child.stdout.pipe(lineFeed);
  child.stdout.on("end", () => fileTee.end());

  child.stderr.on("data", (chunk: Buffer) => {
    fileTee.write(chunk);
    // stderr (crashes, panics, stack-traces) is always mirrored — decoupled
    // from the stdout gate — so an agent failure stays visible in the run log
    // even when the verbose stdout transcript is muted.
    if (mirror.stderr) {
      process.stderr.write(chunk);
    }
  });

  const ticker = new Ticker();
  let lastTodos: Todo[] = [];
  const throttledTodos = hasCookingComment
    ? throttleLatest<Todo[]>(async (todos) => {
        const markdown = renderPlan(todos, workflowUrl);
        try {
          await github.updateZone(cookingCommentId, "plan", markdown);
          console.log(`[ticker] updated plan section (${todos.length} todos)`);
        } catch (e) {
          console.error("[ticker] PATCH failed:", e);
        }
      }, TICKER_DEBOUNCE_MS)
    : null;
  if (throttledTodos) {
    ticker.addFlusher(throttledTodos.flush);
  } else {
    console.log(
      "[ticker] no cooking comment; plan mirroring disabled (direct mode)",
    );
  }
  ticker.on("TodoWrite", (inner: InnerToolResult) => {
    const todos = inner.data?.todos;
    if (!Array.isArray(todos)) return;
    lastTodos = todos;
    if (throttledTodos) throttledTodos.call(todos);
  });

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
    let recovered: OpenPr | null = null;
    try {
      recovered = await recoverUnpushedWork({
        github,
        dryRun,
        context: recoveryContext(ctx),
        runId: optional("GITHUB_RUN_ID"),
      });
    } catch (e) {
      console.error("[recover] unexpected failure:", e);
    }

    try {
      if (recovered) {
        await linkPr(github, recovered, hasCookingComment, cookingCommentId);
      } else {
        await linkAgentPr({
          github,
          cookingCommentId,
          hasCookingComment,
          dryRun,
          canBackfill: ctx.kind === "issue" || ctx.kind === "direct",
          issueNumber: ctx.kind === "issue" ? ctx.issueNumber : undefined,
        });
      }
    } catch (e) {
      console.error("[pr-link] failed:", e);
    }
  } else {
    console.log("[pr-link] git operations disabled, skipping");
  }

  const stoppedEarly = detectStoppedEarly(lastTodos, enableGitOps);
  setOutput("stopped-early", String(stoppedEarly));

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

// Spinner + persistent "View Job" link, re-emitted on every plan update so a
// TodoWrite never erases them (mirrors the spinner contract in github.ts).
// clearSpinner strips the spinner on finish; the View Job link stays pinned at
// the top of the comment through every state.
function renderHeader(workflowUrl: string): string {
  return workflowUrl
    ? `${SPINNER_BLOCK}\n\n[View Job](${workflowUrl})`
    : SPINNER_BLOCK;
}

export function renderPlan(todos: Todo[], workflowUrl: string): string {
  const header = renderHeader(workflowUrl);
  if (todos.length === 0) {
    return `${header}\n\n### Todos\n\n_(agent has not posted a plan yet)_`;
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
  return [header, "", "### Todos", "", ...lines].join("\n");
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

function collectDiffStat(baseRef: string, git: GitExec = sh): string {
  try {
    return git(`git diff --stat origin/${baseRef}...HEAD`);
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

  await linkPr(args.github, pr, args.hasCookingComment, args.cookingCommentId);
}

// Writes the PR URL to the `pr-url` output and surfaces it — into the cooking
// comment's middle zone in event-driven mode, or the job summary in direct mode.
// Shared by linkAgentPr (the agent's own PR) and the recovery path below (the
// runner's draft PR), so both link identically.
async function linkPr(
  github: GithubClient,
  pr: OpenPr,
  hasCookingComment: boolean,
  cookingCommentId: number,
): Promise<void> {
  setOutput("pr-url", pr.url);
  console.log(`[pr-link] linking PR: ${pr.url}`);
  if (hasCookingComment) {
    await appendPrToComment(github, cookingCommentId, pr.url);
  } else {
    appendStepSummary(`### 🔀 Pull Request\n\n${pr.url}`);
    console.log("[pr-link] wrote PR link to job summary (direct mode)");
  }
}

// ===== Runner-owned PR recovery (the safety net) =====
//
// The action used to delegate ALL of branch/commit/push/PR creation to the model
// via the system prompt. When a weak model ignored those steps it made file edits
// but never branched/committed/pushed/opened a PR — the work was left uncommitted
// and silently lost (issue #85). Recovery takes that out of the model's hands:
// after the agent exits, the runner itself recovers unpushed work into a pushed
// DRAFT PR. It never merges, and never pushes main/master.

export type GitExec = (cmd: string) => string;

export type RecoveryContext =
  | { kind: "issue"; issueNumber: number }
  | { kind: "direct" }
  | { kind: "pr"; headRef: string; baseRef: string }
  | { kind: "skip" };

export interface RecoverDeps {
  github: Pick<
    GithubClient,
    "getOpenPrForBranch" | "createDraftPr" | "getDefaultBranch"
  >;
  dryRun: boolean;
  context: RecoveryContext;
  runId: string;
  git?: GitExec;
}

// Maps the full TaskContext onto the minimal shape recovery needs. Fork PRs are
// read-only (the runner can't push to the fork) and any non-writable context maps
// to `skip`, for which recovery no-ops.
export function recoveryContext(ctx: TaskContext): RecoveryContext {
  if (ctx.kind === "issue") {
    return { kind: "issue", issueNumber: ctx.issueNumber };
  }
  if (ctx.kind === "direct") return { kind: "direct" };
  if (ctx.kind === "pull_request" && !ctx.isFork) {
    return { kind: "pr", headRef: ctx.headRef, baseRef: ctx.baseRef };
  }
  return { kind: "skip" };
}

// Returns the PR it created (issue/direct) so the caller can link it directly and
// skip pulls.list lag; returns null when there was nothing to recover, when the
// context is `pr` (its existing PR is surfaced by linkAgentPr), or when the push
// was rejected. Fail-soft throughout: failures log "[recover] …" and the job
// continues. Never force-pushes; never pushes main/master.
export async function recoverUnpushedWork(
  deps: RecoverDeps,
): Promise<OpenPr | null> {
  if (deps.context.kind === "skip") return null;
  const git = deps.git ?? sh;
  try {
    const branch = gitTrim(git, "git branch --show-current");
    const onMain = branch === "" || branch === "main" || branch === "master";

    const dirty = gitTrim(git, "git status --porcelain") !== "";
    const ahead = hasUnpushedCommits(git, branch, onMain);
    if (!dirty && !ahead) {
      console.log(
        "[recover] nothing to recover (clean tree, nothing unpushed)",
      );
      return null;
    }

    const target = recoveryBranch(deps.context, branch, onMain, deps.runId);

    if (deps.dryRun) {
      const action = deps.context.kind === "pr" ? "push it" : "open a draft PR";
      console.log(
        `[dry-run] [recover] would recover work to ${target} and ${action}`,
      );
      return null;
    }

    if (onMain && deps.context.kind !== "pr") {
      git(`git checkout -B ${target}`);
      console.log(
        `[recover] was on ${branch || "detached HEAD"}; moved work to ${target}`,
      );
    }

    let committed = false;
    if (dirty) {
      git("git add -A");
      const staged = gitTrim(git, "git diff --cached --name-only") !== "";
      if (staged) {
        git(`git commit -m ${shellQuote(recoveryCommitMessage(deps.context))}`);
        committed = true;
        console.log("[recover] committed recovered changes");
      } else {
        console.log("[recover] nothing staged after add -A; skipping commit");
      }
    }

    if (!committed && !ahead) {
      console.log("[recover] nothing new to push after staging; skipping");
      return null;
    }

    try {
      git(`git push -u origin ${target}`);
      console.log(`[recover] pushed ${target}`);
    } catch (e) {
      console.error(
        `[recover] push of ${target} rejected (branch may have diverged); leaving local commits:`,
        e,
      );
      return null;
    }

    if (deps.context.kind === "pr") return null;

    const existing = await deps.github.getOpenPrForBranch(target);
    if (existing) {
      console.log(
        `[recover] PR already exists for ${target} (#${existing.number}); linking it`,
      );
      return existing;
    }

    const base = await resolveBase(deps);
    const issueNumber =
      deps.context.kind === "issue" ? deps.context.issueNumber : undefined;
    const created = await deps.github.createDraftPr({
      head: target,
      base,
      title: recoveryPrTitle(deps.context),
      body: buildPrBody({
        commitSubjects: collectCommitSubjects(base, git),
        diffStat: collectDiffStat(base, git),
        issueNumber,
      }),
    });
    console.log(`[recover] opened DRAFT PR for ${target}: ${created.url}`);
    return created;
  } catch (e) {
    console.error("[recover] failed, leaving tree as-is:", e);
    return null;
  }
}

// The branch recovery pushes to — NEVER main/master. PR context reuses the PR
// head; a non-main feature branch the agent already moved to is reused; otherwise
// (on main or detached HEAD) a fresh name is derived from the context.
function recoveryBranch(
  context: RecoveryContext,
  branch: string,
  onMain: boolean,
  runId: string,
): string {
  if (context.kind === "pr") return context.headRef;
  if (!onMain) return branch;
  if (context.kind === "issue") return `fix/issue-${context.issueNumber}`;
  return runId ? `infer/auto-${runId}` : `infer/auto-${Date.now()}`;
}

function recoveryCommitMessage(context: RecoveryContext): string {
  if (context.kind === "issue") return `fix: resolve #${context.issueNumber}`;
  if (context.kind === "pr") return "fix: recover uncommitted changes";
  return "chore: recover agent changes";
}

function recoveryPrTitle(context: RecoveryContext): string {
  return context.kind === "issue"
    ? `fix: resolve #${context.issueNumber}`
    : "chore: recover agent changes";
}

// True when HEAD has commits the remote doesn't — the "agent committed but never
// pushed" signal. Conservative (only true when genuinely ahead) so a clean run
// never triggers a spurious recovery. Tries the configured upstream first, then
// the remote branch, then the remote default tip.
function hasUnpushedCommits(
  git: GitExec,
  branch: string,
  onMain: boolean,
): boolean {
  const upstream = gitTrim(
    git,
    "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}",
  );
  if (upstream) {
    return gitCountNonZero(git, "git rev-list --count @{upstream}..HEAD");
  }
  if (!onMain && gitTrim(git, `git ls-remote --heads origin ${branch}`)) {
    return gitCountNonZero(git, `git rev-list --count origin/${branch}..HEAD`);
  }
  for (const base of ["origin/HEAD", "origin/main", "origin/master"]) {
    const n = gitTrim(git, `git rev-list --count ${base}..HEAD`);
    if (n !== "") return n !== "0";
  }
  return false;
}

async function resolveBase(deps: RecoverDeps): Promise<string> {
  try {
    const def = await deps.github.getDefaultBranch();
    if (def) return def;
  } catch (e) {
    console.error("[recover] getDefaultBranch failed, defaulting to main:", e);
  }
  return "main";
}

// Runs a git command and trims stdout; returns "" if it fails, so a missing ref
// or non-git state reads as "no signal" instead of throwing.
function gitTrim(git: GitExec, cmd: string): string {
  try {
    return git(cmd).trim();
  } catch {
    return "";
  }
}

function gitCountNonZero(git: GitExec, cmd: string): boolean {
  const n = gitTrim(git, cmd);
  return n !== "" && n !== "0";
}

// Single-quotes a value for safe interpolation into a `bash -c` command line.
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// Commit subjects on the current branch since it diverged from origin/<base>,
// newest last. Used to synthesise a PR body when the agent left a thin one.
function collectCommitSubjects(baseRef: string, git: GitExec = sh): string[] {
  try {
    return git(`git log origin/${baseRef}..HEAD --format=%s`)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (e) {
    console.error("[pr-link] git log failed:", e);
    return [];
  }
}

// Read-only check of whether the agent stopped before finishing its work. Two
// signals: any todo left non-completed (the plan was not finished), or - when
// git ops are on - tracked changes left uncommitted in the working tree (work
// that would be lost when the ephemeral runner ends). The runner never writes
// here; it only reports, so post-results can render an honest "stopped early"
// status instead of a misleading green check. The agent's reminders push it to
// leave a draft PR for exactly these cases.
function detectStoppedEarly(todos: Todo[], enableGitOps: boolean): boolean {
  const incompleteTodos = todos.some((t) => t.status !== "completed");
  let dirtyTree = false;
  if (enableGitOps) {
    try {
      dirtyTree =
        sh("git status --porcelain --untracked-files=no").trim() !== "";
    } catch (e) {
      console.error("[stopped-early] git status failed:", e);
    }
  }
  const stoppedEarly = incompleteTodos || dirtyTree;
  if (stoppedEarly) {
    console.log(
      `[stopped-early] run did not finish cleanly (incompleteTodos=${incompleteTodos}, dirtyTree=${dirtyTree})`,
    );
  }
  return stoppedEarly;
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

// Auto-run only as the CLI entrypoint. Vitest imports this module to unit-test
// renderPlan, so skip main() under the test runner to keep importing side-effect
// free. VITEST is never set in the action runtime, so production is unchanged.
if (!process.env["VITEST"]) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error("[runner] uncaught error:", e);
      process.exit(1);
    },
  );
}

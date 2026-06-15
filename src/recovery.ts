// Shared recovery library: the work-salvage, PR-linking and stopped-early logic
// that the dedicated `recover` action step (src/recover.ts) runs. It lives in
// its own module — NOT in runner.ts — because runner.ts auto-runs main() on
// import; importing recovery from there would re-spawn the agent. The runner
// imports only the small git/output helpers (sh, collectDiffStat, dumpAgentTail,
// setOutput) from here.
//
// Why this is a separate `always()` step: the agent child can wedge (e.g. inside
// a compaction LLM call) and keep stdout open, so the runner never reaches its
// post-exit code. When the job then hits its `timeout-minutes`, GitHub cancels
// the run-agent step — but `always()` steps still run in the cancellation window
// (~4 min). So recovery placed here survives a job timeout that the in-runner
// version (issue: it ran after the agent exited) never did.

import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type { TaskContext } from "./context.js";
import type { GithubClient, OpenPr } from "./github.js";
import { buildPrBody, isThinPrBody } from "./pr-body.js";
import type { Todo } from "./types.js";

const AGENT_OUTPUT_PATH = "/tmp/agent-output.txt";
const SH_TIMEOUT_MS = 60_000;

// The runner's signal handler writes this marker synchronously when a job
// `timeout-minutes` cancellation kills run-agent mid-run; the separate recover
// process reads it to tell a genuine cancellation apart from a runner crash or a
// skipped/failed upstream step. All three leave run-agent's exit-code output
// empty, but only the cancellation is a soft ⚠️ (work recovered) — the others
// are real ❌ failures. Keying the timeout solely off an empty exit-code (as the
// first cut did) laundered crashes and skipped steps into benign timeouts.
const CANCEL_MARKER_PATH = "/tmp/infer-cancelled";

export type GitExec = (cmd: string) => string;

// Written by the runner's signal handler the instant a SIGINT/SIGTERM arrives,
// before any work that could hang (dump/kill), so the marker survives even if the
// runner is then SIGKILLed. Best-effort: a failure to write only costs the
// timeout-vs-crash distinction, not correctness of the recovery itself.
export function writeCancelMarker(): void {
  try {
    writeFileSync(CANCEL_MARKER_PATH, "1");
  } catch (e) {
    console.error("[runner] failed to write cancel marker:", e);
  }
}

// Cleared at runner startup so a stale marker from a prior job on a reused
// (self-hosted) runner can't be read as a cancellation of this run. The cleanup
// step also removes it at the end of every run.
export function clearCancelMarker(): void {
  try {
    rmSync(CANCEL_MARKER_PATH, { force: true });
  } catch {
    // best-effort reset
  }
}

export function cancelMarkerPresent(): boolean {
  try {
    return existsSync(CANCEL_MARKER_PATH);
  } catch {
    return false;
  }
}

// ===== Orchestration: what the `recover` step actually runs =====

export interface RunRecoveryDeps {
  github: GithubClient;
  ctx: TaskContext;
  enableGitOps: boolean;
  dryRun: boolean;
  hasCookingComment: boolean;
  cookingCommentId: number;
  todos: Todo[];
  runId: string;
  runAgentExitCode: string;
  runAgentDurationMs: string;
  redact: (s: string) => string;
}

// Salvages any unpushed work, links the resulting (or agent-authored) PR, and
// emits the result outputs post-results consumes. Idempotent on the happy path:
// recoverUnpushedWork no-ops on a clean tree and linkAgentPr just surfaces the
// PR the agent already opened.
export async function runRecovery(deps: RunRecoveryDeps): Promise<void> {
  const cancelled = cancelMarkerPresent();

  if (cancelled) {
    console.log(
      "[recover] run-agent was cancelled (job timeout); salvaging its work",
    );
    dumpAgentTail(40, deps.redact);
  }

  if (deps.enableGitOps) {
    let recovered: OpenPr | null = null;
    try {
      recovered = await recoverUnpushedWork({
        github: deps.github,
        dryRun: deps.dryRun,
        context: recoveryContext(deps.ctx),
        runId: deps.runId,
      });
    } catch (e) {
      console.error("[recover] unexpected failure:", e);
    }

    try {
      if (recovered) {
        await linkPr(
          deps.github,
          recovered,
          deps.hasCookingComment,
          deps.cookingCommentId,
        );
      } else {
        await linkAgentPr({
          github: deps.github,
          cookingCommentId: deps.cookingCommentId,
          hasCookingComment: deps.hasCookingComment,
          dryRun: deps.dryRun,
          canBackfill: deps.ctx.kind === "issue" || deps.ctx.kind === "direct",
          issueNumber:
            deps.ctx.kind === "issue" ? deps.ctx.issueNumber : undefined,
        });
      }
    } catch (e) {
      console.error("[pr-link] failed:", e);
    }
  } else {
    console.log("[pr-link] git operations disabled, skipping");
  }

  const status = finalizeStatus(
    deps.runAgentExitCode,
    detectStoppedEarly(deps.todos, deps.enableGitOps),
    cancelled,
  );

  setOutput("exit-code", status.exitCode);
  setOutput("run-duration-ms", deps.runAgentDurationMs || "0");
  setOutput("stopped-early", String(status.stoppedEarly));
  setOutput("timed-out", String(status.timedOut));
  setOutput("result", status.result);
}

export interface FinalStatus {
  exitCode: string;
  timedOut: boolean;
  stoppedEarly: boolean;
  result: string;
}

// Normalises run-agent's raw exit into the final reported status.
//
// `cancelled` (the runner's cancel marker), not an empty exit-code, is the
// timeout signal. The three cases that leave `runAgentExitCode` empty must NOT
// be conflated:
//   - cancelled (marker present)  → soft ⚠️, exit-code normalised to 0, the
//     work was recovered into a draft PR; never a hard failure.
//   - empty WITHOUT the marker    → run-agent crashed or an upstream step was
//     skipped/failed; a real ❌ failure (exit-code 1), not a benign timeout.
//   - a real exit-code            → passed through; 0 is success, non-zero ❌.
// `incompleteOrDirty` is the detectStoppedEarly signal (unfinished todos or a
// still-dirty tree after recovery), and only colours an otherwise-successful run.
export function finalizeStatus(
  runAgentExitCode: string,
  incompleteOrDirty: boolean,
  cancelled: boolean,
): FinalStatus {
  if (cancelled) {
    return {
      exitCode: "0",
      timedOut: true,
      stoppedEarly: true,
      result: "Agent stopped early (hit the job time limit); work recovered",
    };
  }
  if (runAgentExitCode === "") {
    return {
      exitCode: "1",
      timedOut: false,
      stoppedEarly: true,
      result:
        "run-agent did not complete (no exit code — it crashed or an earlier step failed)",
    };
  }
  const result =
    runAgentExitCode === "0"
      ? "Agent completed successfully"
      : `Agent failed with exit code ${runAgentExitCode}`;
  return {
    exitCode: runAgentExitCode,
    timedOut: false,
    stoppedEarly: incompleteOrDirty,
    result,
  };
}

// The agent owns PR creation (see system prompt step 3). The recover step does
// not open or fall back to opening a PR; it only surfaces the PR the agent
// opened. In event-driven mode it links the PR in the cooking comment; in direct
// mode (no comment) it writes the link to the job summary. Either way it exports
// the URL as the `pr-url` step output. If no PR exists, there is nothing to link.
//
// Safety net: weaker models sometimes open the PR with a thin body (e.g. a bare
// "Fixes #N"). When `canBackfill` (issue/direct runs, where the agent created the
// PR) and the body is thin, the body is rewritten from the commit log via the
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
// Shared by linkAgentPr (the agent's own PR) and recoverUnpushedWork (the
// recovered draft PR), so both link identically.
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

// ===== PR recovery (the safety net) =====
//
// The action used to delegate ALL of branch/commit/push/PR creation to the model
// via the system prompt. When a weak model ignored those steps it made file edits
// but never branched/committed/pushed/opened a PR — the work was left uncommitted
// and silently lost (issue #85). Recovery takes that out of the model's hands:
// the recover step itself salvages unpushed work into a pushed DRAFT PR. It never
// merges, and never pushes main/master.

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
// read-only (we can't push to the fork) and any non-writable context maps to
// `skip`, for which recovery no-ops.
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
      git(`git checkout -B ${shellQuote(target)}`);
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
      git(`git push -u origin ${shellQuote(target)}`);
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
  if (
    !onMain &&
    gitTrim(git, `git ls-remote --heads origin ${shellQuote(branch)}`)
  ) {
    return gitCountNonZero(
      git,
      `git rev-list --count origin/${shellQuote(branch)}..HEAD`,
    );
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

// Read-only check of whether the agent stopped before finishing its work. Two
// signals: any todo left non-completed (the plan was not finished), or — when
// git ops are on — tracked changes left uncommitted in the working tree (work
// that would be lost when the ephemeral runner ends). On the recover step this
// runs AFTER recoverUnpushedWork, so a recovered (now-committed) tree reads
// clean; the incomplete-todos signal then carries the "stopped early" status.
export function detectStoppedEarly(
  todos: Todo[],
  enableGitOps: boolean,
): boolean {
  const incompleteTodos =
    Array.isArray(todos) &&
    todos.some(
      (t) => (t as { status?: string } | null)?.status !== "completed",
    );
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

// Diff stat for the current branch vs origin/<base>. Used both by the runner (to
// describe a PR in the agent's task) and by recovery (to synthesise a PR body).
export function collectDiffStat(baseRef: string, git: GitExec = sh): string {
  try {
    return git(`git diff --stat origin/${shellQuote(baseRef)}...HEAD`);
  } catch (e) {
    console.error("[runner] git diff --stat failed:", e);
    return "";
  }
}

// Commit subjects on the current branch since it diverged from origin/<base>,
// newest last. Used to synthesise a PR body when the agent left a thin one.
function collectCommitSubjects(baseRef: string, git: GitExec = sh): string[] {
  try {
    return git(`git log origin/${shellQuote(baseRef)}..HEAD --format=%s`)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (e) {
    console.error("[pr-link] git log failed:", e);
    return [];
  }
}

// Dumps the last `n` non-empty lines of the agent transcript to the Actions log
// (stderr, so it survives stdout muting) before cleanup deletes the file — so a
// maintainer can see the last activity before a hang. Each line is redacted and
// capped so one giant JSON payload can't flood the log.
export function dumpAgentTail(
  n: number,
  redact: (s: string) => string = (s) => s,
): void {
  try {
    const text = readFileSync(AGENT_OUTPUT_PATH, "utf8");
    const lines = text.split("\n").filter((l) => l.trim() !== "");
    const tail = lines.slice(-n);
    if (tail.length === 0) return;
    console.error("==========================================");
    console.error(
      `[recover] last ${tail.length} line(s) of agent activity before it stopped:`,
    );
    console.error("------------------------------------------");
    for (const line of tail) {
      const capped = line.length > 2000 ? line.slice(0, 2000) + " …" : line;
      console.error(redact(capped));
    }
    console.error("==========================================");
  } catch (e) {
    console.error(
      "[recover] could not read agent transcript for breadcrumb:",
      e,
    );
  }
}

// ===== git + output helpers (shared with the runner) =====

// Runs a command via bash, non-interactively, with a hard timeout so a wedged
// git/gh call (e.g. a push hanging on auth) can't burn the whole job /
// cancellation budget. GIT_TERMINAL_PROMPT=0 turns credential prompts into
// immediate failures instead of hangs.
export function sh(cmd: string): string {
  return execFileSync("bash", ["-c", cmd], {
    encoding: "utf8",
    timeout: SH_TIMEOUT_MS,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
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

export function setOutput(name: string, value: string): void {
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

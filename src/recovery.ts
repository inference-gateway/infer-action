// Shared recovery library: the work-salvage, PR-linking and stopped-early logic
// the salvage and report action steps run (src/salvage.ts, src/report.ts). It
// lives in its own module - NOT in runner.ts - because runner.ts auto-runs
// main() on import; importing recovery from there would re-spawn the agent. The
// runner imports only the small git/output helpers (sh, collectDiffStat,
// dumpAgentTail, setOutput) from here.
//
// Why these are separate post-agent steps: the agent child can wedge (e.g.
// inside a compaction LLM call) and keep stdout open, so the runner never reaches
// its post-exit code. When the job then hits its `timeout-minutes`, GitHub
// cancels the run-agent step - but `always()` steps still run in the
// cancellation window (~4 min). So salvage and report (both always()) survive a
// job timeout. Salvage also runs on a graceful exit-0: an agent that finishes
// without pushing would otherwise lose its work with the ephemeral runner; the
// any-state PR lookup and tree-identity guards below keep that path free of
// duplicate PRs.

import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type { TaskContext } from "./context.js";
import type { BranchPr, GithubClient, OpenPr } from "./github.js";
import { buildPrBody, isThinPrBody } from "./pr-body.js";
import type { Todo } from "./types.js";

const AGENT_OUTPUT_PATH = "/tmp/agent-output.txt";
const SH_TIMEOUT_MS = 60_000;

// The runner's signal handler writes this marker synchronously when a job
// `timeout-minutes` cancellation kills run-agent mid-run; the separate recover
// process reads it to tell a genuine cancellation apart from a runner crash or a
// skipped/failed upstream step. All three leave run-agent's exit-code output
// empty, but only the cancellation is a soft ⚠️ (work recovered) - the others
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

// The transcript-tail breadcrumb is for interrupted/failed runs only; an
// empty exit-code counts as not-graceful (crash or cancelled mid-run).
export function shouldDumpTail(
  runAgentExitCode: string,
  cancelled: boolean,
): boolean {
  return runAgentExitCode !== "0" || cancelled;
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
        "run-agent did not complete (no exit code - it crashed or an earlier step failed)",
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
// API - model-independent, and not subject to the agent's bash allow-list.
export async function linkAgentPr(args: {
  github: GithubClient;
  cookingCommentId: number;
  hasCookingComment: boolean;
  dryRun: boolean;
  canBackfill: boolean;
  issueNumber: number | undefined;
}): Promise<string> {
  const branch = sh("git branch --show-current").trim();
  if (
    !branch ||
    branch === "main" ||
    branch === "master" ||
    branch === "HEAD"
  ) {
    console.log(`[pr-link] on ${branch || "detached HEAD"}, nothing to link`);
    return "";
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
    return "";
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

  return linkPr(
    args.github,
    pr.url,
    args.hasCookingComment,
    args.cookingCommentId,
  );
}

// Writes the PR URL to the `pr-url` output and surfaces it - into the cooking
// comment's middle zone in event-driven mode, or the job summary in direct mode.
// Shared by linkAgentPr (the agent's own PR) and the report step (a draft PR's
// URL salvaged by the salvage step), so both link identically.
export async function linkPr(
  github: GithubClient,
  url: string,
  hasCookingComment: boolean,
  cookingCommentId: number,
): Promise<string> {
  setOutput("pr-url", url);
  console.log(`[pr-link] linking PR: ${url}`);
  if (hasCookingComment) {
    await appendPrToComment(github, cookingCommentId, url);
  } else {
    appendStepSummary(`### 🔀 Pull Request\n\n${url}`);
    console.log("[pr-link] wrote PR link to job summary (direct mode)");
  }
  return url;
}

// ===== PR recovery (the safety net) =====
//
// The action used to delegate ALL of branch/commit/push/PR creation to the model
// via the system prompt. When a weak model ignored those steps it made file edits
// but never branched/committed/pushed/opened a PR - the work was left uncommitted
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
    "getPrForBranch" | "createDraftPr" | "getDefaultBranch"
  >;
  dryRun: boolean;
  context: RecoveryContext;
  runId: string;
  git?: GitExec;
}

export interface RecoveryResult {
  // The PR to link (created or already open); null when none.
  pr: OpenPr | null;
  // True when work was preserved (committed and/or pushed), even without a PR.
  salvaged: boolean;
}

const NOT_SALVAGED: RecoveryResult = { pr: null, salvaged: false };

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

// Returns the PR to link (issue/direct): the draft it created, or the already-
// open PR for the branch. Returns null when there was nothing to recover, when
// the context is `pr` (its existing PR is surfaced by linkAgentPr), when the
// push was rejected, or when a merged/closed PR already exists for the branch
// (work is pushed but a duplicate PR is never opened). Fail-soft throughout:
// failures log "[recover] …" and the job continues. Never force-pushes; never
// pushes main/master.
export async function recoverUnpushedWork(
  deps: RecoverDeps,
): Promise<RecoveryResult> {
  if (deps.context.kind === "skip") return NOT_SALVAGED;
  const git = deps.git ?? sh;
  let preserved = false;
  try {
    const branch = gitTrim(git, "git branch --show-current");
    const onMain = branch === "" || branch === "main" || branch === "master";

    const dirty = gitTrim(git, "git status --porcelain") !== "";
    const ahead = hasUnpushedCommits(git, branch, onMain);
    if (!dirty && !ahead) {
      console.log(
        "[recover] nothing to recover (clean tree, nothing unpushed)",
      );
      return NOT_SALVAGED;
    }

    const target = recoveryBranch(deps.context, branch, onMain, deps.runId);

    if (deps.dryRun) {
      const action = deps.context.kind === "pr" ? "push it" : "open a draft PR";
      console.log(
        `[dry-run] [recover] would recover work to ${target} and ${action}`,
      );
      return NOT_SALVAGED;
    }

    let existingPr: BranchPr | null = null;
    let prLookupFailed = false;
    if (deps.context.kind !== "pr") {
      try {
        existingPr = await deps.github.getPrForBranch(target);
      } catch (e) {
        prLookupFailed = true;
        console.error(
          `[recover] PR lookup for ${target} failed; will push work but not open a PR:`,
          e,
        );
      }
    }

    if (
      !dirty &&
      existingPr &&
      existingPr.state !== "open" &&
      treeMatchesBase(git, existingPr.baseRef)
    ) {
      console.log(
        `[recover] branch ${target} was already ${existingPr.merged ? "merged" : "closed"} as PR #${existingPr.number} and its tree matches origin/${existingPr.baseRef}; nothing to salvage`,
      );
      return NOT_SALVAGED;
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
      return NOT_SALVAGED;
    }

    try {
      pushWithRebaseFallback(git, target);
      console.log(`[recover] pushed ${target}`);
      preserved = true;
    } catch (e) {
      console.error(
        `[recover] push of ${target} failed after rebase retry; leaving local commits:`,
        e,
      );
      return NOT_SALVAGED;
    }

    if (deps.context.kind === "pr") return { pr: null, salvaged: true };

    if (existingPr && existingPr.state === "open") {
      console.log(
        `[recover] PR already exists for ${target} (#${existingPr.number}); linking it`,
      );
      return { pr: existingPr, salvaged: true };
    }
    if (existingPr) {
      console.log(
        `[recover] PR #${existingPr.number} for ${target} was already ${existingPr.merged ? "merged" : "closed"}; work pushed to ${target} but not opening a duplicate PR`,
      );
      return { pr: null, salvaged: true };
    }
    if (prLookupFailed) {
      console.log(
        `[recover] work pushed to ${target}; skipping PR creation because the PR lookup failed (avoiding a possible duplicate)`,
      );
      return { pr: null, salvaged: true };
    }

    const base = await resolveBase(deps);
    if (treeMatchesBase(git, base)) {
      console.log(
        `[recover] ${target} is tree-identical to origin/${base}; skipping PR creation`,
      );
      return NOT_SALVAGED;
    }
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
        note: SALVAGE_PR_NOTE,
      }),
    });
    console.log(`[recover] opened DRAFT PR for ${target}: ${created.url}`);
    return { pr: created, salvaged: true };
  } catch (e) {
    console.error("[recover] failed, leaving tree as-is:", e);
    return { pr: null, salvaged: preserved };
  }
}

// Rendered under ## Summary so a salvaged draft PR is recognizable at a glance.
const SALVAGE_PR_NOTE =
  "_This draft PR was opened automatically by infer-action's salvage step: the run ended without the agent pushing its work or opening a pull request. Review the changes and mark the PR ready, or close it if it is not useful._";

// True when HEAD's tree is identical to origin/<base> (typical after a
// squash-merge). A throw (trees differ, missing ref) reads as "differs" so a
// genuinely new change is never suppressed.
function treeMatchesBase(git: GitExec, baseRef: string): boolean {
  try {
    git(`git diff --quiet origin/${shellQuote(baseRef)} HEAD`);
    return true;
  } catch {
    return false;
  }
}

// The branch recovery pushes to - NEVER main/master. PR context reuses the PR
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

// "(salvaged)" makes a runner-opened draft recognizable in the PR list.
function recoveryPrTitle(context: RecoveryContext): string {
  return context.kind === "issue"
    ? `fix: resolve #${context.issueNumber} (salvaged)`
    : "chore: salvage unpushed agent work";
}

// True when HEAD has commits the remote doesn't - the "agent committed but never
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

// Read-only check of whether the agent stopped before finishing. Signals: any
// non-completed todo, and - with git ops on - a dirty tree (untracked files
// included; `.infer/` noise is hidden from git elsewhere) or unpushed commits.
// Runs after the salvage step, so salvaged work reads clean; a run that leaves
// unpushed or uncommitted work can never render ✅ Success.
export function detectStoppedEarly(
  todos: Todo[],
  enableGitOps: boolean,
  git: GitExec = sh,
): boolean {
  const incompleteTodos =
    Array.isArray(todos) &&
    todos.some(
      (t) => (t as { status?: string } | null)?.status !== "completed",
    );
  let dirtyTree = false;
  let unpushedCommits = false;
  if (enableGitOps) {
    try {
      dirtyTree = git("git status --porcelain").trim() !== "";
    } catch (e) {
      console.error("[stopped-early] git status failed:", e);
    }
    try {
      const branch = gitTrim(git, "git branch --show-current");
      const onMain = branch === "" || branch === "main" || branch === "master";
      unpushedCommits = hasUnpushedCommits(git, branch, onMain);
    } catch (e) {
      console.error("[stopped-early] unpushed-commits check failed:", e);
    }
  }
  const stoppedEarly = incompleteTodos || dirtyTree || unpushedCommits;
  if (stoppedEarly) {
    console.log(
      `[stopped-early] run did not finish cleanly (incompleteTodos=${incompleteTodos}, dirtyTree=${dirtyTree}, unpushedCommits=${unpushedCommits})`,
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
// (stderr, so it survives stdout muting) before cleanup deletes the file - so a
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

// Pushes `target` to origin, and on a non-fast-forward rejection pulls
// --rebase to integrate the diverged remote tip before retrying once. This
// addresses the case where the action times out and another recovery / a human
// pushed to the same branch in the meantime: instead of silently dropping the
// agent's work, the local commit is rebased onto the new tip and pushed again.
// The rebase is best-effort: any failure (auth, conflict, etc.) is logged and
// surfaced to the caller so the surrounding try/catch can leave the local
// commits intact and let the maintainer resolve manually.
function pushWithRebaseFallback(git: GitExec, target: string): void {
  const cmd = `git push -u origin ${shellQuote(target)}`;
  try {
    git(cmd);
    return;
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (!isNonFastForward(msg)) {
      // Not a "remote has commits you don't" rejection - auth, network, hook,
      // ref policy, etc. Don't try to rewrite history; surface to the caller.
      throw e;
    }
    console.warn(
      `[recover] push of ${target} rejected (remote has diverged); rebasing and retrying`,
    );
  }

  // Try the same branch first (most common - another recovery / a human landed
  // commits on the recovery branch). Fall back to the default branch when the
  // remote has no record of the recovery branch yet (e.g. the prior push was
  // race-rejected mid-handshake, so the tip is on origin/main instead).
  for (const base of [target, "main", "master"]) {
    try {
      git(`git pull --rebase --autostash origin ${shellQuote(base)}`);
      console.log(`[recover] rebased ${target} onto origin/${base}`);
      break;
    } catch (e) {
      console.error(
        `[recover] rebase onto origin/${base} failed; trying next fallback:`,
        e,
      );
    }
  }

  // Always rethrow the original push error if the retry still fails - the
  // caller catches it and leaves the local commits for the maintainer to
  // recover. We do NOT force-push or rewrite history.
  git(`git push -u origin ${shellQuote(target)}`);
}

// Recognise the well-known shapes of a non-fast-forward push rejection. The
// "(fetch first)" hint and "non-fast-forward" reason string have been around
// since git 1.8/2.x and are emitted by every modern git for the diverged-tip
// case. "stale info" and "remote ref updated" cover concurrent-push races
// introduced in 2.30+; we deliberately do NOT match bare "[rejected]" (that's
// also used for hook / ref-policy / protected-branch failures, which are not
// recoverable by rebasing).
function isNonFastForward(stderr: string): boolean {
  return (
    stderr.includes("non-fast-forward") ||
    stderr.includes("fetch first") ||
    stderr.includes("stale info") ||
    stderr.includes("remote ref updated")
  );
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

#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createWriteStream, writeFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import type { PullRequestContext, TaskContext } from "./context.js";
import { loadContext, loadFallbackContext } from "./context.js";
import { composeBashAllowAppend } from "./bash-allow.js";
import { GithubClient, SPINNER_BLOCK } from "./github.js";
import { planLogMirroring } from "./log-mirror.js";
import { readJsonLines } from "./parser.js";
import {
  buildSystemPrompt,
  buildTask,
  systemPromptOverrideWarnings,
} from "./prompts.js";
import {
  composeReminders,
  defaultRemindersPath,
  renderRemindersYaml,
  writeRemindersFile,
} from "./reminders.js";
import {
  collectSecretValues,
  createRedactor,
  emitAddMaskDirectives,
  SECRET_ENV_NAMES,
} from "./redact.js";
import {
  clearCancelMarker,
  collectDiffStat,
  dumpAgentTail,
  setOutput,
  sh,
  writeCancelMarker,
} from "./recovery.js";
import { Ticker, throttleLatest } from "./ticker.js";
import { isCompactionMessage } from "./types.js";
import type { InnerToolResult, Todo } from "./types.js";
import { formatDuration } from "./duration.js";

const AGENT_OUTPUT_PATH = "/tmp/agent-output.txt";
const TODOS_PATH = "/tmp/infer-todos.json";
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
  const debugEvents = optional("INFER_LOGGING_DEBUG") === "true";
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

  // A system-prompt override wholesale-replaces the bundled default, so a
  // consumer customising it silently drops the branch/commit/push/draft-PR
  // safety block and the finish checklist. Warn in the run log so the lost-work
  // failure mode the defaults guard against doesn't disappear silently. Only
  // relevant when git operations are enabled (comment-only mode never commits).
  if (enableGitOps) {
    for (const d of systemPromptOverrideWarnings(ctx)) {
      const slug = d.key
        .replace(/^SYSTEM_/, "")
        .toLowerCase()
        .replace(/_/g, "-");
      process.stdout.write(
        `::warning::INFER_PROMPT_OVERRIDE_${d.key} replaces the bundled system ` +
          `prompt (system-prompt-${slug} / src/prompts/system-${slug}.md) and is ` +
          `missing the git-safety markers: ${d.missing.join(", ")}. The default ` +
          `guards against lost work (branch-first, commit-per-todo, push, draft ` +
          `PR, finish checklist); your override dropped those instructions, so ` +
          `the agent may leave changes uncommitted or unpushed. Re-add them to ` +
          `your override, or use the custom-instructions input to layer extras ` +
          `on top of the default instead of replacing it.\n`,
      );
    }
  }
  const remindersYaml = renderRemindersYaml(
    composeReminders(ctx, {
      enableGitOps,
      memoryEnabled: optional("INFER_MEMORY_ENABLED") === "true",
    }),
  );

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
    console.log("DRY RUN - the agent would be invoked with:");
    console.log("==========================================");
    console.log(`Model:        ${model}`);
    console.log(`Context kind: ${ctx.kind}`);
    console.log(`Git ops:      ${enableGitOps ? "enabled" : "disabled"}`);
    console.log(`INFER_BIN:    ${inferBin}`);
    console.log(`--- REMINDERS (written to ${defaultRemindersPath()}) ---`);
    console.log(remindersYaml);
    console.log(
      "--- BASH ALLOW-LIST APPEND (added to the CLI read-only baseline) ---",
    );
    console.log(bashAllowAppend || "(none - CLI read-only baseline only)");
    console.log("==========================================");
  }

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    INFER_AGENT_SYSTEM_PROMPT: systemPrompt,
    INFER_TOOLS_BASH_ALLOW_APPEND: bashAllowAppend,
  };

  writeRemindersFile(remindersYaml);

  clearTodos();
  clearCancelMarker();

  const agentStartTime = Date.now();

  const child = spawn(inferBin, ["agent", "-m", model, task], {
    stdio: ["inherit", "pipe", "pipe"],
    env: childEnv,
  });

  if (!child.stdout || !child.stderr) {
    throw new Error("child stdio not piped - this should not happen");
  }

  let cancelledBySignal = false;
  let signalHandled = false;
  const onSignal = (sig: NodeJS.Signals): void => {
    if (signalHandled) return;
    signalHandled = true;
    cancelledBySignal = true;

    writeCancelMarker();
    console.error(
      `[runner] received ${sig}; stopping the agent so the salvage step can recover its work`,
    );
    try {
      child.kill("SIGKILL");
    } catch (e) {
      console.error("[runner] failed to stop agent child:", e);
    }
  };
  process.once("SIGTERM", () => onSignal("SIGTERM"));
  process.once("SIGINT", () => onSignal("SIGINT"));

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
    if (mirror.stderr) {
      process.stderr.write(chunk);
    }
  });

  const ticker = new Ticker();
  const throttledTodos = hasCookingComment
    ? throttleLatest<Todo[]>(async (todos) => {
        const markdown = renderPlan(todos, workflowUrl, model);
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
    persistTodos(todos);
    if (throttledTodos) throttledTodos.call(todos);
  });

  if (debugEvents) {
    ticker.onMessage((msg) => {
      if (isCompactionMessage(msg)) {
        console.log(
          msg.type === "compaction_started"
            ? "[agent] context compaction started (summarising older turns)…"
            : "[agent] context compaction completed",
        );
        return;
      }
      const m = msg as { role?: unknown; hidden?: unknown; kind?: unknown };
      if (
        m.role === "user" &&
        m.hidden === true &&
        m.kind === "system_reminder"
      ) {
        console.log("[agent] system reminder injected");
      }
    });
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

  if (cancelledBySignal) {
    setOutput("run-duration-ms", String(durationMs));
    await flushFileTee(fileTee);
    dumpAgentTail(40, redactor.redact);
    console.error(
      "[runner] cancelled mid-run; the salvage step will recover any work and report the timeout",
    );
    return 130;
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

// Spinner + persistent model/"View Job" header, re-emitted on every plan update
// so a TodoWrite never erases them (mirrors the spinner contract in github.ts).
// The model is pinned here so it is visible at all times - which model picked up
// the task - and survives the end-of-run spinner clear. clearSpinner strips the
// spinner on finish; the model + View Job link stay pinned at the top of the
// comment through every state.
function renderHeader(workflowUrl: string, model: string): string {
  const metaParts = [`**Model:** \`${model}\``];
  if (workflowUrl) metaParts.push(`[View Job](${workflowUrl})`);
  return `${SPINNER_BLOCK}\n\n${metaParts.join(" · ")}`;
}

export function renderPlan(
  todos: Todo[],
  workflowUrl: string,
  model: string,
): string {
  const header = renderHeader(workflowUrl, model);
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

async function waitForExit(child: ReturnType<typeof spawn>): Promise<number> {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
  });
}

// Waits for the transcript file tee to finish writing (2s cap).
async function flushFileTee(
  stream: ReturnType<typeof createWriteStream>,
): Promise<void> {
  if (stream.writableFinished) return;
  await Promise.race([
    new Promise<void>((resolve) => stream.once("finish", resolve)),
    new Promise<void>((resolve) => setTimeout(resolve, 2000).unref()),
  ]);
}

// Latest-wins handoff of the agent's todos to the separate recover process, so
// it can compute the stopped-early signal even when this runner is killed
// mid-run. Synchronous so the last write survives an abrupt kill.
function persistTodos(todos: Todo[]): void {
  try {
    writeFileSync(TODOS_PATH, JSON.stringify(todos));
  } catch (e) {
    console.error("[runner] failed to persist todos:", e);
  }
}

function clearTodos(): void {
  try {
    writeFileSync(TODOS_PATH, "[]");
  } catch {
    // Best-effort reset; a stale file is the recover step's problem to default.
  }
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

// Auto-run only as the entrypoint. `import.meta.main` is true when bun executes
// this file directly and false when a test imports it, so main() never fires
// under `bun test`.
if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error("[runner] uncaught error:", e);
      process.exit(1);
    },
  );
}

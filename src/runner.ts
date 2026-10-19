#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, writeFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import type { PullRequestContext } from "./context.js";
import { composeBashAllowAppend } from "./bash-allow.js";
import { SPINNER_BLOCK } from "./github.js";
import { readRunMeta, renderRunMeta } from "./run-meta.js";
import type { RunMeta } from "./run-meta.js";
import { planLogMirroring } from "./log-mirror.js";
import { readJsonLines } from "./parser.js";
import {
  AGENT_OUTPUT_PATH,
  TODOS_PATH,
  bootEntry,
  loadContextOrFallback,
  optional,
  required,
} from "./prelude.js";
import {
  buildSystemPrompt,
  buildTask,
  systemPromptOverrideWarnings,
} from "./prompts.js";
import { asksForDemo, resolveRemindersYaml, wrapUpText } from "./reminders.js";
import {
  clearCancelMarker,
  collectDiffStat,
  dumpAgentTail,
  MAX_TURNS_EXIT_CODE,
  setOutput,
  sh,
  writeCancelMarker,
} from "./recovery.js";
import type { GitExec } from "./recovery.js";
import { Ticker, throttleLatest } from "./ticker.js";
import { isCompactionMessage } from "./types.js";
import type { InnerToolResult, Todo } from "./types.js";
import { formatDuration } from "./duration.js";

const TICKER_DEBOUNCE_MS = 1500;

async function main(): Promise<number> {
  const { dryRun, enableGitOps, redactor, github } = bootEntry();
  const reviewMode = optional("INFER_REVIEW_MODE") === "true";
  const writable = enableGitOps && !reviewMode;
  const cookingCommentIdRaw = optional("INFER_COOKING_COMMENT_ID");
  const cookingCommentId = cookingCommentIdRaw
    ? Number.parseInt(cookingCommentIdRaw, 10)
    : 0;
  const hasCookingComment =
    Number.isFinite(cookingCommentId) && cookingCommentId > 0;
  const model = required("INFER_AGENT_MODEL");
  const runMeta = readRunMeta(process.env, model);
  const timeBudget = parseTimeBudget(optional("INFER_TIME_BUDGET_MINUTES"));
  const customInstructions = withTimeBudgetNote(
    optional("INFER_CUSTOM_INSTRUCTIONS"),
    timeBudget,
  );
  const extraBashAllow = optional("INFER_BASH_ALLOW_APPEND");
  const debugEvents = optional("INFER_LOGGING_DEBUG") === "true";
  const mirror = planLogMirroring(process.env);

  const ctx = await loadContextOrFallback(process.env, github, {
    stepName: "dry-run",
    failHard: !dryRun,
  });

  if (ctx.kind === "pull_request" && (enableGitOps || reviewMode)) {
    try {
      ensurePrHeadCheckedOut(ctx);
    } catch (e) {
      if (!dryRun) throw e;
      console.warn(
        "[dry-run] PR head checkout failed; continuing on the current branch:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  const diffStat =
    ctx.kind === "pull_request" ? collectDiffStat(ctx.baseRef) : "";

  const ciChecksSection =
    ctx.kind === "pull_request" ? await github.getPrCheckRuns(ctx.headRef) : "";

  const systemPrompt = buildSystemPrompt(ctx, customInstructions);
  const task = buildTask(ctx, { diffStat, ciChecksSection });

  if (writable) {
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
  const remindersConfig = optional("INFER_REMINDERS_CONFIG");
  const recordDemo =
    optional("INFER_COMPUTER_USE_RECORDING_ENABLED") === "true" &&
    asksForDemo(ctx);
  const remindersYaml = resolveRemindersYaml(remindersConfig, ctx, {
    enableGitOps: writable,
    maxTurns: Number.parseInt(optional("INFER_AGENT_MAX_TURNS"), 10) || 0,
    recordDemo,
  });

  const bashAllowAppend = composeBashAllowAppend(
    writable,
    extraBashAllow,
    recordDemo,
  );

  const inferBin = optional("INFER_BIN") || "infer";
  const noColor = optional("INFER_NO_COLOR") === "true";

  const childEnv = buildChildEnv(process.env, {
    systemPrompt,
    bashAllowAppend,
    remindersYaml,
    reviewMode,
    recordDemo,
  });

  console.log("==========================================");
  console.log("SYSTEM PROMPT:");
  console.log("==========================================");
  const mergedPrompt = optional("INFER_BIN")
    ? undefined
    : resolveMergedSystemPrompt(inferBin, childEnv);
  console.log(
    mergedPrompt === undefined
      ? systemPrompt
      : redactMemoryIndex(mergedPrompt, debugEvents),
  );
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
    console.log(
      `Review mode:  ${reviewMode ? "enabled (Edit/Write/Delete disabled)" : "disabled"}`,
    );
    console.log(`INFER_BIN:    ${inferBin}`);
    console.log("--- REMINDERS (INFER_REMINDERS_CONFIG) ---");
    console.log(remindersYaml);
    console.log(
      "--- BASH ALLOW-LIST APPEND (added to the CLI read-only baseline) ---",
    );
    console.log(bashAllowAppend || "(none - CLI read-only baseline only)");
    console.log("==========================================");
  }

  clearTodos();
  clearCancelMarker();

  const agentStartTime = Date.now();

  const agentArgs = ["headless", "--format", "json-pretty", "-m", model, task];
  if (noColor) agentArgs.push("--no-colors");
  const child = spawn(inferBin, agentArgs, {
    stdio: [timeBudget ? "pipe" : "inherit", "pipe", "pipe"],
    env: childEnv,
  });

  if (!child.stdout || !child.stderr) {
    throw new Error("child stdio not piped - this should not happen");
  }

  let cancelledBySignal = false;
  let stopHandled = false;
  const stopAgent = (reason: string): void => {
    if (stopHandled) return;
    stopHandled = true;
    cancelledBySignal = true;

    writeCancelMarker();
    console.error(
      `[runner] ${reason}; stopping the agent so the salvage step can recover its work`,
    );
    try {
      child.kill("SIGKILL");
    } catch (e) {
      console.error("[runner] failed to stop agent child:", e);
    }
  };
  process.once("SIGTERM", () => stopAgent("received SIGTERM"));
  process.once("SIGINT", () => stopAgent("received SIGINT"));

  const budgetTimers = timeBudget
    ? [
        setTimeout(() => {
          console.log(
            `[runner] ${WRAP_UP_SHARE * 100}% of the ${timeBudget.minutes} min time budget used; asking the agent to wrap up`,
          );
          child.stdin?.end(wrapUpFrame(wrapUpText(ctx)));
        }, timeBudget.wrapUpMs),
        setTimeout(
          () => stopAgent(`${timeBudget.minutes} min time budget reached`),
          timeBudget.stopMs,
        ),
      ]
    : [];

  const fileTee = createWriteStream(AGENT_OUTPUT_PATH);
  const lineFeed = new PassThrough();

  child.stdout.pipe(fileTee, { end: false });
  if (mirror.stdout) {
    child.stdout.pipe(process.stdout, { end: false });
  } else {
    console.log(
      "[runner] agent stdout muted (set mirror-agent-logs: true or debug: true to mirror); stderr still shown, full transcript written to /tmp/agent-output.txt",
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
        const markdown = renderPlan(todos, runMeta);
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
    throttledTodos.call([]);
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
  for (const timer of budgetTimers) clearTimeout(timer);
  const durationMs = Date.now() - agentStartTime;

  console.log("");
  console.log("==========================================");
  console.log(`Agent exited with code ${exitCode}`);
  console.log(`Duration: ${formatDuration(durationMs)}`);
  console.log("==========================================");

  if (cancelledBySignal) {
    setOutput("run-duration-ms", String(durationMs));
    await flushFileTee(fileTee);
    if (mirror.stdout) {
      dumpAgentTail(40, redactor.redact);
    }
    console.error(
      "[runner] cancelled mid-run; the salvage step will recover any work and report the timeout",
    );
    return 130;
  }

  setOutput("exit-code", String(exitCode));
  setOutput("run-duration-ms", String(durationMs));

  if (exitCode === MAX_TURNS_EXIT_CODE) {
    setOutput("result", "Agent stopped early (reached the turn limit)");
    console.error(
      "[runner] agent reached max turns; the salvage step will recover any unpushed work and the report renders a stopped-early status",
    );
    return 0;
  }

  setOutput(
    "result",
    exitCode === 0
      ? "Agent completed successfully"
      : `Agent failed with exit code ${exitCode}`,
  );

  return exitCode;
}

const WRAP_UP_SHARE = 0.8;

export interface TimeBudget {
  minutes: number;
  wrapUpMs: number;
  stopMs: number;
}

// A wall-clock budget for the agent run: the wrap-up nudge goes out at 80% of it
// and the agent is stopped at 100%, before the job's timeout-minutes and the
// one-hour GitHub App token can cut salvage and report off. Empty or zero means off.
export function parseTimeBudget(minutes: string): TimeBudget | undefined {
  const n = Number.parseFloat(minutes);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const stopMs = Math.round(n * 60_000);
  return { minutes: n, wrapUpMs: Math.round(stopMs * WRAP_UP_SHARE), stopMs };
}

// Tells the agent its budget up front, so it plans for the clock and not only
// for the turn limit.
export function withTimeBudgetNote(
  customInstructions: string,
  budget: TimeBudget | undefined,
): string {
  if (!budget) return customInstructions;
  const note = `This run has a wall-clock budget of ${budget.minutes} minutes. Branch, edit, commit and push early: at ${Math.round(budget.minutes * WRAP_UP_SHARE)} minutes you are asked to wrap up, and at ${budget.minutes} minutes the run is stopped and only pushed work survives.`;
  return customInstructions ? `${customInstructions}\n\n${note}` : note;
}

// One run_agent_input frame on the headless CLI's stdin: the message is queued
// and the agent reads it after its current tool call, like a reminder.
export function wrapUpFrame(text: string): string {
  return `${JSON.stringify({
    type: "run_agent_input",
    input: { messages: [{ role: "user", content: text }] },
  })}\n`;
}

// Setting a dead env var name is silently ignored by the CLI, so every name
// here is load-bearing - guarded by the CI contract test against the pinned
// CLI. WITH_DEFAULTS is pinned so a consumer config can't drop the CLI's
// dynamic context block (skills, memory, tools, bash allow-list).
export function buildChildEnv(
  base: NodeJS.ProcessEnv,
  opts: {
    systemPrompt: string;
    bashAllowAppend: string;
    remindersYaml: string;
    reviewMode: boolean;
    recordDemo: boolean;
  },
): NodeJS.ProcessEnv {
  return {
    ...base,
    INFER_PROMPTS_AGENT_SYSTEM_PROMPT: opts.systemPrompt,
    INFER_AGENT_SYSTEM_PROMPT_WITH_DEFAULTS: "true",
    INFER_TOOLS_BASH_ALLOW_APPEND: opts.bashAllowAppend,
    INFER_REMINDERS_CONFIG: opts.remindersYaml,
    INFER_REVIEW_INLINE: base["INFER_REVIEW_INLINE"] ?? "",
    INFER_COMPUTER_USE_RECORDING_ENABLED: String(opts.recordDemo),
    ...(opts.reviewMode
      ? {
          INFER_TOOLS_EDIT_ENABLED: "false",
          INFER_TOOLS_WRITE_ENABLED: "false",
          INFER_TOOLS_DELETE_ENABLED: "false",
        }
      : {}),
    OTEL_EXPORTER_OTLP_ENDPOINT: base["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "",
    OTEL_EXPORTER_OTLP_HEADERS: base["OTEL_EXPORTER_OTLP_HEADERS"] ?? "",
    OTEL_SERVICE_NAME: base["OTEL_SERVICE_NAME"] ?? "infer-action",
    OTEL_RESOURCE_ATTRIBUTES: base["OTEL_RESOURCE_ATTRIBUTES"] ?? "",
  };
}

// The prompt the agent actually receives is the action's prompt merged with
// the CLI's dynamic context block (tools, skills, memory, sandbox). Only the
// CLI can render that, so ask it; fail-soft (undefined) when the binary is a
// mock or the subcommand is unavailable, and the caller prints the
// action-side prompt instead.
export function resolveMergedSystemPrompt(
  inferBin: string,
  env: NodeJS.ProcessEnv,
): string | undefined {
  try {
    const res = spawnSync(inferBin, ["debug", "agent", "system_prompt"], {
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    if (res.status !== 0 || !res.stdout?.trim()) return undefined;
    return res.stdout;
  } catch {
    return undefined;
  }
}

// Memory entries can carry cross-repo facts that don't belong in a public
// Actions log; collapse the memory index section unless debug is on.
export function redactMemoryIndex(prompt: string, debug: boolean): string {
  if (debug) return prompt;
  const start = prompt.indexOf("PERSISTENT MEMORY INDEX");
  if (start === -1) return prompt;
  const rest = prompt.slice(start);
  const end = rest.indexOf("\n\nCurrent date:");
  const tail = end === -1 ? "" : rest.slice(end);
  return `${prompt.slice(0, start)}PERSISTENT MEMORY INDEX: [redacted - set debug: true to include memory entries]${tail}`;
}

/** Spinner plus the pinned run identity, re-emitted on every plan update so a TodoWrite never erases them. */
export function renderPlan(todos: Todo[], meta: RunMeta): string {
  const header = `${SPINNER_BLOCK}\n\n${renderRunMeta(meta)}`;
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

function isMissingRemoteRef(e: unknown): boolean {
  const stderr = (e as { stderr?: unknown }).stderr;
  const text =
    (typeof stderr === "string" ? stderr : "") + String((e as Error).message);
  return text.includes("couldn't find remote ref");
}

export function ensurePrHeadCheckedOut(
  ctx: PullRequestContext,
  exec: GitExec = sh,
): void {
  try {
    if (ctx.isFork) {
      const localBranch = `pr-${ctx.prNumber}`;
      console.log(
        `[runner] fork PR; fetching pull/${ctx.prNumber}/head into ${localBranch}`,
      );
      exec(`git fetch origin pull/${ctx.prNumber}/head:${localBranch}`);
      exec(`git checkout ${localBranch}`);
    } else {
      console.log(`[runner] checking out PR head branch ${ctx.headRef}`);
      try {
        exec(`git fetch origin ${ctx.headRef}`);
      } catch (e) {
        if (!isMissingRemoteRef(e)) throw e;
        process.stdout.write(
          `::warning::PR head branch ${ctx.headRef} no longer exists on origin ` +
            `(likely deleted when the PR was closed or merged); recreating it ` +
            `from pull/${ctx.prNumber}/head. If the PR is closed or merged, ` +
            `pushing will not reopen it.\n`,
        );
        exec(`git fetch origin pull/${ctx.prNumber}/head:${ctx.headRef}`);
      }
      exec(`git checkout ${ctx.headRef}`);
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

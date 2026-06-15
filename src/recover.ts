#!/usr/bin/env node
// The `recover` action step (dist/recover/index.js). Runs as an `always()` step
// AFTER run-agent, so it executes on every outcome — happy exit, crash, or a job
// `timeout-minutes` cancellation (GitHub runs `always()` steps in the
// cancellation window). It salvages any unpushed agent work into a draft PR,
// links it, and emits the result outputs post-results consumes. See src/recovery.ts.

import { readFileSync } from "node:fs";
import { loadContext, loadFallbackContext } from "./context.js";
import type { TaskContext } from "./context.js";
import { GithubClient } from "./github.js";
import {
  collectSecretValues,
  createRedactor,
  emitAddMaskDirectives,
  SECRET_ENV_NAMES,
} from "./redact.js";
import { runRecovery } from "./recovery.js";
import type { Todo } from "./types.js";

const TODOS_PATH = "/tmp/infer-todos.json";

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
  const enableGitOps = optional("INFER_ENABLE_GIT_OPERATIONS") !== "false";
  const enableHeuristics = optional("INFER_REDACT_HEURISTICS") === "true";
  const runId = optional("GITHUB_RUN_ID");
  const runAgentExitCode = optional("INFER_RUN_AGENT_EXIT_CODE");
  const runAgentDurationMs = optional("INFER_RUN_AGENT_DURATION_MS");

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

  await runRecovery({
    github,
    ctx,
    enableGitOps,
    dryRun,
    hasCookingComment,
    cookingCommentId,
    todos: readTodos(),
    runId,
    runAgentExitCode,
    runAgentDurationMs,
    redact: redactor.redact,
  });

  return 0;
}

// The runner persists the agent's latest todos here (latest-wins) so this
// separate process can read them for the stopped-early signal even when the
// runner was killed mid-run. Missing/unreadable ⇒ no todos (safe default).
function readTodos(): Todo[] {
  try {
    const parsed = JSON.parse(readFileSync(TODOS_PATH, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as Todo[]) : [];
  } catch {
    return [];
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

// Auto-run only as the CLI entrypoint. Vitest never sets VITEST in the action
// runtime, so production is unchanged; the guard keeps importing this module
// side-effect free under the test runner.
if (!process.env["VITEST"]) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error("[recover] uncaught error:", e);
      process.exit(1);
    },
  );
}

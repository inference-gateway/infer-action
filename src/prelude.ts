// Shared entrypoint prelude for the three bundled action steps (runner,
// salvage, report): env helpers, the temp-file handoff paths, the redactor +
// GithubClient boot block, and the context-load-with-fallback. Each entrypoint
// used to carry its own copy of these; keeping them here is what stops the
// copies drifting (the runner's context fallback had already grown its own
// dry-run rethrow).

import type { TaskContext } from "./context.js";
import { loadContext, loadFallbackContext } from "./context.js";
import type { GithubReader } from "./github.js";
import { GithubClient } from "./github.js";
import type { Redactor } from "./redact.js";
import {
  collectSecretValues,
  createRedactor,
  emitAddMaskDirectives,
  SECRET_ENV_NAMES,
} from "./redact.js";

// Temp-file handoff paths shared across the steps: the runner writes them, the
// salvage and report processes read them after the runner is gone.
export const AGENT_OUTPUT_PATH = "/tmp/agent-output.txt";
export const TODOS_PATH = "/tmp/infer-todos.json";
export const CANCEL_MARKER_PATH = "/tmp/infer-cancelled";

export function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var ${name}`);
  }
  return v;
}

export function optional(name: string): string {
  return process.env[name] ?? "";
}

export interface EntryBoot {
  dryRun: boolean;
  token: string;
  repo: string;
  enableGitOps: boolean;
  enableHeuristics: boolean;
  redactor: Redactor;
  github: GithubClient;
}

// The common boot block: read the shared env knobs, mask known secret values in
// the Actions log, build the redactor, and construct the GithubClient. The
// token is required except under dry-run (unauthenticated reads fail-soft).
// NOTE: callers that can no-op without a token (salvage's git-ops-off gate)
// must return BEFORE calling this, since it reads GITHUB_TOKEN.
export function bootEntry(): EntryBoot {
  const dryRun = optional("INFER_DRY_RUN") === "true";
  const token = dryRun ? optional("GITHUB_TOKEN") : required("GITHUB_TOKEN");
  const repo = required("INFER_REPO");
  const enableGitOps = optional("INFER_ENABLE_GIT_OPERATIONS") !== "false";
  const enableHeuristics = optional("INFER_REDACT_HEURISTICS") === "true";

  const secretValues = collectSecretValues(process.env, SECRET_ENV_NAMES);
  emitAddMaskDirectives(secretValues);
  const redactor = createRedactor({
    env: process.env,
    heuristics: enableHeuristics,
  });

  const reviewComment = optional("INFER_COOKING_COMMENT_IS_REVIEW") === "true";
  const github = new GithubClient({
    token,
    repo,
    redactor,
    dryRun,
    reviewComment,
  });

  return {
    dryRun,
    token,
    repo,
    enableGitOps,
    enableHeuristics,
    redactor,
    github,
  };
}

// Context load with the fail-soft fallback each step used to hand-roll.
// `stepName` keeps the per-step warn prefix; `failHard` rethrows instead of
// falling back (the runner fails hard outside dry-run — running the agent
// against a half-loaded context would be worse than not running at all,
// whereas salvage/report must degrade to env-derived data on any outcome).
export async function loadContextOrFallback(
  env: NodeJS.ProcessEnv,
  github: GithubReader,
  opts: { stepName: string; failHard?: boolean },
): Promise<TaskContext> {
  try {
    return await loadContext(env, github);
  } catch (e) {
    if (opts.failHard) throw e;
    console.warn(
      `[${opts.stepName}] context read failed (${(e as Error).message}); proceeding with env-derived data`,
    );
    return loadFallbackContext(env);
  }
}

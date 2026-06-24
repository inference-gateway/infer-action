#!/usr/bin/env node
// The `salvage` action step (dist/salvage/index.js). Runs ONLY when the run did
// not finish gracefully — gated `if: cancelled() || failure()` in action.yml, so
// a clean agent exit (exit 0) never reaches it (that is the fix for #130: no
// draft PR is opened on a graceful finish). GitHub runs `cancelled()`/`failure()`
// steps in the cancellation window (~4 min), so this survives a job-timeout
// cancellation that killed run-agent mid-run.
//
// It salvages any uncommitted / unpushed agent work onto a branch and opens a
// DRAFT pull request, then exports the PR URL as the `pr-url` output for the
// always() report step to link. It never merges and never pushes main/master.
// See src/recovery.ts for the salvage mechanics.

import { loadContext, loadFallbackContext } from "./context.js";
import type { TaskContext } from "./context.js";
import { GithubClient } from "./github.js";
import {
  collectSecretValues,
  createRedactor,
  emitAddMaskDirectives,
  SECRET_ENV_NAMES,
} from "./redact.js";
import {
  dumpAgentTail,
  recoverUnpushedWork,
  recoveryContext,
  setOutput,
} from "./recovery.js";

async function main(): Promise<number> {
  const dryRun = optional("INFER_DRY_RUN") === "true";

  const enableGitOps = optional("INFER_ENABLE_GIT_OPERATIONS") !== "false";
  if (!enableGitOps) {
    console.log("[salvage] git operations disabled; nothing to salvage");
    return 0;
  }

  const token = dryRun ? optional("GITHUB_TOKEN") : required("GITHUB_TOKEN");
  const repo = required("INFER_REPO");
  const enableHeuristics = optional("INFER_REDACT_HEURISTICS") === "true";
  const runId = optional("GITHUB_RUN_ID");

  const secretValues = collectSecretValues(process.env, SECRET_ENV_NAMES);
  emitAddMaskDirectives(secretValues);
  const redactor = createRedactor({
    env: process.env,
    heuristics: enableHeuristics,
  });

  const github = new GithubClient({ token, repo, redactor, dryRun });

  dumpAgentTail(40, redactor.redact);

  let ctx: TaskContext;
  try {
    ctx = await loadContext(process.env, github);
  } catch (e) {
    console.warn(
      `[salvage] context read failed (${(e as Error).message}); proceeding with env-derived data`,
    );
    ctx = loadFallbackContext(process.env);
  }

  try {
    const recovered = await recoverUnpushedWork({
      github,
      dryRun,
      context: recoveryContext(ctx),
      runId,
    });
    if (recovered) {
      setOutput("pr-url", recovered.url);
      console.log(`[salvage] draft PR ready: ${recovered.url}`);
    } else {
      console.log("[salvage] nothing to salvage");
    }
  } catch (e) {
    console.error("[salvage] failed, leaving tree as-is:", e);
  }

  return 0;
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

// Auto-run only as the CLI entrypoint. `import.meta.main` is false when a test
// imports this module and true only when bun runs it directly, so importing it
// stays side-effect free.
if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error("[salvage] uncaught error:", e);
      process.exit(1);
    },
  );
}

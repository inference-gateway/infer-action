#!/usr/bin/env node
// The `salvage` action step (dist/salvage/index.js). Gated `always()` in
// action.yml: it survives a job-timeout cancellation (GitHub runs always()
// steps in the cancellation window) and also catches a graceful exit-0 where
// the agent finished without pushing its work. On a proper finish it is a
// no-op.
//
// It salvages uncommitted/unpushed agent work onto a branch and opens a DRAFT
// pull request, exporting the `pr-url` and `salvaged` outputs for the report
// step. It never merges and never pushes main/master.

import { bootEntry, loadContextOrFallback, optional } from "./prelude.js";
import { planLogMirroring } from "./log-mirror.js";
import {
  cancelMarkerPresent,
  dumpAgentTail,
  recoverUnpushedWork,
  recoveryContext,
  setOutput,
  shouldDumpTail,
} from "./recovery.js";

async function main(): Promise<number> {
  const enableGitOps = optional("INFER_ENABLE_GIT_OPERATIONS") !== "false";
  if (!enableGitOps) {
    console.log("[salvage] git operations disabled; nothing to salvage");
    return 0;
  }

  const { dryRun, redactor, github } = bootEntry();
  const runId = optional("GITHUB_RUN_ID");
  const mirror = planLogMirroring(process.env);

  if (
    mirror.stdout &&
    shouldDumpTail(optional("INFER_RUN_AGENT_EXIT_CODE"), cancelMarkerPresent())
  ) {
    dumpAgentTail(40, redactor.redact);
  }

  const ctx = await loadContextOrFallback(process.env, github, {
    stepName: "salvage",
  });

  try {
    const recovered = await recoverUnpushedWork({
      github,
      dryRun,
      context: recoveryContext(ctx),
      runId,
    });
    if (recovered.pr) {
      setOutput("pr-url", recovered.pr.url);
      console.log(`[salvage] draft PR ready: ${recovered.pr.url}`);
    }
    if (recovered.salvaged) {
      setOutput("salvaged", "true");
    } else if (!recovered.pr) {
      console.log("[salvage] nothing to salvage");
    }
  } catch (e) {
    console.error("[salvage] failed, leaving tree as-is:", e);
  }

  return 0;
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

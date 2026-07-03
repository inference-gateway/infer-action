#!/usr/bin/env node
// The `report` action step (dist/report/index.js). Runs as an `always()` step
// after run-agent (and after the conditional `salvage` step), so it executes on
// every outcome - happy exit, crash, or a job-`timeout-minutes` cancellation
// (GitHub runs `always()` steps in the cancellation window). It is the single
// "finalize & report" step: it computes the run's final status, links the
// relevant PR (the draft the salvage step pushed, or the one the agent opened on
// the happy path), renders the result footer into the cooking comment, exports
// the action's status outputs, and ships telemetry.
//
// It merges what used to be the `recover` (finalize + PR-link) and `post-results`
// steps into one process - one env block, the status computed inline instead of
// handed across via step outputs.

import { appendFileSync, readFileSync } from "node:fs";
import { loadContext, loadFallbackContext } from "./context.js";
import type { TaskContext } from "./context.js";
import { formatDuration } from "./duration.js";
import {
  extractFailures,
  extractToolCallCounts,
  type ToolFailure,
} from "./failures.js";
import { GithubClient } from "./github.js";
import { loadOtelConfig, exportTelemetry, type RunTelemetry } from "./otel.js";
import { parseAgentOutput } from "./parser.js";
import {
  collectSecretValues,
  createRedactor,
  emitAddMaskDirectives,
  SECRET_ENV_NAMES,
} from "./redact.js";
import {
  cancelMarkerPresent,
  detectStoppedEarly,
  finalizeStatus,
  linkAgentPr,
  linkPr,
  setOutput,
} from "./recovery.js";
import { extractFinalResponse } from "./response.js";
import type { Todo } from "./types.js";
import { extractUsage, type CostTotals, type UsageTotals } from "./usage.js";

const AGENT_OUTPUT_PATH = "/tmp/agent-output.txt";
const TODOS_PATH = "/tmp/infer-todos.json";
const MAX_RESPONSE_CHARS = 16_000;

async function main(): Promise<number> {
  const dryRun = optional("INFER_DRY_RUN") === "true";
  const token = dryRun ? optional("GITHUB_TOKEN") : required("GITHUB_TOKEN");
  const repo = required("INFER_REPO");
  const issueNumberStr = optional("INFER_ISSUE_NUMBER");
  const issueNumber = issueNumberStr ? Number.parseInt(issueNumberStr, 10) : 0;
  const cookingCommentIdStr = optional("INFER_COOKING_COMMENT_ID");
  const cookingCommentId = cookingCommentIdStr
    ? Number.parseInt(cookingCommentIdStr, 10)
    : 0;
  const hasCookingComment =
    Number.isFinite(cookingCommentId) && cookingCommentId > 0;
  const modelUsed = optional("INFER_MODEL_USED") || "(unknown)";
  const workflowUrl = optional("INFER_WORKFLOW_URL") || "";
  const actor = optional("INFER_ACTOR") || "(unknown)";
  const enableGitOps = optional("INFER_ENABLE_GIT_OPERATIONS") !== "false";
  const enableHeuristics = optional("INFER_REDACT_HEURISTICS") === "true";
  const runAgentExitCode = optional("INFER_RUN_AGENT_EXIT_CODE");
  const runAgentDurationMs = optional("INFER_RUN_AGENT_DURATION_MS");
  const salvagedPrUrl = optional("INFER_SALVAGED_PR_URL");
  const salvaged =
    salvagedPrUrl !== "" || optional("INFER_SALVAGED") === "true";

  const secretValues = collectSecretValues(process.env, SECRET_ENV_NAMES);
  emitAddMaskDirectives(secretValues);
  const redactor = createRedactor({
    env: process.env,
    heuristics: enableHeuristics,
  });

  const github = new GithubClient({ token, repo, redactor, dryRun });

  const status = finalizeStatus(
    runAgentExitCode,
    detectStoppedEarly(readTodos(), enableGitOps) || salvaged,
    cancelMarkerPresent(),
  );
  setOutput("exit-code", status.exitCode);
  setOutput("run-duration-ms", runAgentDurationMs || "0");
  setOutput("stopped-early", String(status.stoppedEarly));
  setOutput("timed-out", String(status.timedOut));
  setOutput("result", status.result);

  let prUrl = "";
  if (enableGitOps) {
    try {
      if (salvagedPrUrl) {
        prUrl = await linkPr(
          github,
          salvagedPrUrl,
          hasCookingComment,
          cookingCommentId,
        );
      } else {
        let ctx: TaskContext;
        try {
          ctx = await loadContext(process.env, github);
        } catch (e) {
          console.warn(
            `[report] context read failed (${(e as Error).message}); proceeding with env-derived data`,
          );
          ctx = loadFallbackContext(process.env);
        }
        prUrl = await linkAgentPr({
          github,
          cookingCommentId,
          hasCookingComment,
          dryRun,
          canBackfill: ctx.kind === "issue" || ctx.kind === "direct",
          issueNumber: ctx.kind === "issue" ? ctx.issueNumber : undefined,
        });
      }
    } catch (e) {
      console.error("[report] PR link failed:", e);
    }
  } else {
    console.log("[report] git operations disabled, skipping PR link");
  }

  const durationMs = runAgentDurationMs
    ? Number.parseFloat(runAgentDurationMs)
    : 0;
  const messages = await parseAgentOutput(AGENT_OUTPUT_PATH);
  const failures = extractFailures(messages).map((f) => ({
    tool: redactor.redact(f.tool),
    message: redactor.redact(f.message),
  }));
  const usage = extractUsage(messages);
  const toolCallCounts = extractToolCallCounts(messages);
  const agentResponse = truncate(
    redactor.redact(extractFinalResponse(messages)),
    MAX_RESPONSE_CHARS,
  );
  const footer = buildFooter({
    exitCode: status.exitCode,
    modelUsed,
    workflowUrl: hasCookingComment ? "" : workflowUrl,
    durationMs,
    actor,
    stoppedEarly: status.stoppedEarly,
    timedOut: status.timedOut,
    salvaged,
    prUrl,
    agentResponse,
    failures,
    usage,
  });

  setOutput("failed-count", String(failures.length));
  setOutput("total-count", String(usage.toolCalls));
  writeStepSummary(redactor.redact(footer));

  let patched = false;
  if (hasCookingComment) {
    try {
      await github.updateZone(cookingCommentId, "result", footer);
      console.log(
        `Updated comment #${cookingCommentId} on issue #${issueNumber}`,
      );
      patched = true;
    } catch (e) {
      console.error(
        `PATCH failed for comment #${cookingCommentId}, falling back to POST:`,
        e,
      );
    }
  }

  if (!patched && issueNumber > 0) {
    try {
      await github.createIssueComment(issueNumber, footer);
      console.log(`Posted fallback comment to issue #${issueNumber}`);
    } catch (e) {
      console.error(
        "Fallback POST also failed; result is only in the workflow summary:",
        e,
      );
    }
  } else if (!patched) {
    console.log(
      "No issue/PR thread to post to; result is in the job summary only (direct mode).",
    );
  }

  if (hasCookingComment) {
    try {
      await github.clearSpinner(cookingCommentId);
    } catch (e) {
      console.error(
        `Failed to clear spinner on comment #${cookingCommentId}:`,
        e,
      );
    }
  }

  try {
    const otelConfig = loadOtelConfig(process.env);
    const telemetry: RunTelemetry = {
      usage,
      failures,
      toolCallCounts,
      exitCode: status.exitCode,
      modelUsed,
      durationMs,
      stoppedEarly: status.stoppedEarly,
      timedOut: status.timedOut,
      actor,
      repo,
      workflowUrl,
      runId: process.env["GITHUB_RUN_ID"] ?? "",
      sha: process.env["GITHUB_SHA"] ?? "",
      ref: process.env["GITHUB_REF"] ?? "",
      eventName: process.env["GITHUB_EVENT_NAME"] ?? "",
      issueNumber: issueNumberStr ?? "",
      prUrl,
    };
    await exportTelemetry(otelConfig, telemetry, redactor, dryRun);
  } catch (e) {
    console.error("[otel] export failed (non-fatal):", e);
  }

  return 0;
}

export interface FooterArgs {
  exitCode: string;
  modelUsed: string;
  workflowUrl: string;
  durationMs: number;
  actor: string;
  stoppedEarly: boolean;
  timedOut?: boolean;
  salvaged?: boolean;
  prUrl: string;
  agentResponse: string;
  failures: ToolFailure[];
  usage: UsageTotals;
}

export function buildFooter(args: FooterArgs): string {
  const timedOut = args.timedOut === true;
  const failed = !timedOut && args.exitCode !== "0";
  const stoppedEarly = !failed && (args.stoppedEarly || timedOut);
  const statusIcon = failed ? "❌" : stoppedEarly ? "⚠️" : "✅";
  const statusText = failed
    ? "Failed"
    : stoppedEarly
      ? "Stopped early"
      : "Success";

  const lines: string[] = [];
  lines.push(`## ${statusIcon} Infer Result: ${statusText}`);
  lines.push("");
  if (stoppedEarly) {
    lines.push(stoppedEarlyNote(timedOut, args.prUrl, args.salvaged === true));
    lines.push("");
  }
  if (args.agentResponse.trim()) {
    lines.push(args.agentResponse);
    lines.push("");
  }
  const metaParts = [
    `**Model:** \`${args.modelUsed}\``,
    `**Exit Code:** \`${args.exitCode}\``,
    `**Duration:** ${args.durationMs > 0 ? formatDuration(args.durationMs) : "-"}`,
  ];
  if (args.workflowUrl) {
    metaParts.push(`[View Job](${args.workflowUrl})`);
  }
  lines.push(metaParts.join(" · "));
  if (args.usage.totalTokens > 0) {
    lines.push("");
    lines.push(formatUsage(args.usage));
    if (args.usage.cost) {
      lines.push("");
      lines.push(formatCost(args.usage.cost));
    }
  }
  if (args.usage.toolCalls > 0) {
    lines.push("");
    lines.push(formatToolCalls(args.usage.toolCalls, args.failures.length));
  }
  lines.push("");

  if (args.failures.length > 0) {
    lines.push(
      `<details><summary>⚠️ ${args.failures.length} failed tool call(s)</summary>`,
    );
    lines.push("");
    for (const f of args.failures) {
      lines.push(`- **${f.tool}**: ${f.message}`);
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  lines.push(
    `*Triggered by ${args.actor} · [Infer Action](https://github.com/inference-gateway/infer-action)*`,
  );

  return lines.join("\n");
}

// The ⚠️ note distinguishes a timeout stop, a salvaged run (the agent finished
// without pushing), and a plain stopped-early run - and says what to do next.
function stoppedEarlyNote(
  timedOut: boolean,
  prUrl: string,
  salvaged: boolean,
): string {
  if (timedOut) {
    return prUrl
      ? "_The agent hit the job's time limit before finishing, so it was stopped to salvage its work. Its committed changes were pushed; the draft pull request is linked above._"
      : "_The agent hit the job's time limit before finishing and was stopped. No pull request was opened; any unpushed work was lost with the runner — check the workflow log for what was attempted and re-trigger to retry._";
  }
  if (salvaged) {
    return prUrl
      ? "_The agent finished without pushing its work. The runner salvaged it into the pull request linked above — review it and mark it ready, or close it if it is not useful._"
      : "_The agent finished without pushing its work. The runner salvaged it onto a pushed branch but did not open a pull request (one already existed for the branch, or the lookup failed) — check the workflow log for the branch name._";
  }
  return prUrl
    ? "_The agent stopped before finishing its plan, so some work may be incomplete. Its committed changes were pushed; the draft pull request is linked above — review what is missing before merging._"
    : "_The agent stopped before finishing its plan, so some work may be incomplete. It did not open a pull request; any unpushed work was lost with the runner — check the workflow log for what was attempted and re-trigger to retry._";
}

function formatUsage(usage: UsageTotals): string {
  const fmt = (n: number): string => n.toLocaleString("en-US");
  const reqs =
    usage.requests === 1 ? "1 request" : `${usage.requests} requests`;
  return `**Tokens:** ${fmt(usage.promptTokens)} in · ${fmt(usage.completionTokens)} out · ${fmt(usage.totalTokens)} total (${reqs})`;
}

// `failed` is clamped to `total` so a malformed stream (more failure results than
// recorded calls) can never produce a negative or >100% success rate.
export function formatToolCalls(total: number, failed: number): string {
  const succeeded = Math.max(0, total - failed);
  const rate = total > 0 ? Math.round((succeeded / total) * 100) : 0;
  return `**Tool calls:** ${total.toLocaleString("en-US")} total · ${rate}% success rate`;
}

export function formatCost(cost: CostTotals): string {
  const currency = cost.currency || "USD";
  return `**Cost:** ${formatMoney(cost.input, currency)} in · ${formatMoney(cost.output, currency)} out · ${formatMoney(cost.total, currency)} total`;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return amount.toLocaleString("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  } catch {
    return `${amount.toFixed(4)} ${currency}`;
  }
}

// Hard-caps a string, appending a marker only when a cut actually happens.
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n\n… (response truncated)";
}

function writeStepSummary(content: string): void {
  const file = process.env["GITHUB_STEP_SUMMARY"];
  if (!file) {
    console.log("(would write step summary)");
    console.log(content);
    return;
  }
  appendFileSync(file, content + "\n");
}

// The runner persists the agent's latest todos here (latest-wins) so this
// separate process can read them for the stopped-early signal even when the
// runner was killed mid-run. Missing/unreadable ⇒ no todos (safe default).
function readTodos(): Todo[] {
  try {
    const parsed = JSON.parse(readFileSync(TODOS_PATH, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is Todo => !!t && typeof t === "object");
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

// Auto-run only as the CLI entrypoint. `bun test` imports this module for its
// pure formatters (buildFooter/formatCost/formatMoney); `import.meta.main` is
// false on import and true only when bun runs this file directly, so production
// behaviour is unchanged.
if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error("[report] uncaught error:", e);
      process.exit(1);
    },
  );
}

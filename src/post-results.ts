#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { extractFailures } from "./failures.js";
import { extractFinalResponse } from "./response.js";
import { GithubClient } from "./github.js";
import {
  collectSecretValues,
  createRedactor,
  emitAddMaskDirectives,
  SECRET_ENV_NAMES,
} from "./redact.js";
import { extractUsage, type CostTotals, type UsageTotals } from "./usage.js";

const AGENT_OUTPUT_PATH = "/tmp/agent-output.txt";
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
  const modelUsed = optional("INFER_MODEL_USED") || "(unknown)";
  const exitCode = optional("INFER_EXIT_CODE") || "1";
  const workflowUrl = optional("INFER_WORKFLOW_URL") || "";
  const actor = optional("INFER_ACTOR") || "(unknown)";
  const enableHeuristics = optional("INFER_REDACT_HEURISTICS") === "true";

  const secretValues = collectSecretValues(process.env, SECRET_ENV_NAMES);
  emitAddMaskDirectives(secretValues);
  const redactor = createRedactor({
    env: process.env,
    heuristics: enableHeuristics,
  });

  const github = new GithubClient({ token, repo, redactor, dryRun });

  const failures = (await extractFailures(AGENT_OUTPUT_PATH)).map((f) =>
    redactor.redact(f),
  );
  const usage = await extractUsage(AGENT_OUTPUT_PATH);
  const agentResponse = truncate(
    redactor.redact(await extractFinalResponse(AGENT_OUTPUT_PATH)),
    MAX_RESPONSE_CHARS,
  );
  const footer = buildFooter({
    exitCode,
    modelUsed,
    workflowUrl,
    actor,
    agentResponse,
    failures,
    usage,
  });

  setOutput("failed-count", String(failures.length));
  setOutput("total-count", String(usage.toolCalls));
  writeStepSummary(redactor.redact(footer));

  let patched = false;
  if (cookingCommentId > 0) {
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

  if (cookingCommentId > 0) {
    try {
      await github.clearSpinner(cookingCommentId);
    } catch (e) {
      console.error(
        `Failed to clear spinner on comment #${cookingCommentId}:`,
        e,
      );
    }
  }

  return 0;
}

export interface FooterArgs {
  exitCode: string;
  modelUsed: string;
  workflowUrl: string;
  actor: string;
  agentResponse: string;
  failures: string[];
  usage: UsageTotals;
}

export function buildFooter(args: FooterArgs): string {
  const success = args.exitCode === "0";
  const statusIcon = success ? "✅" : "❌";
  const statusText = success ? "Success" : "Failed";

  const lines: string[] = [];
  lines.push(`## ${statusIcon} Infer Result: ${statusText}`);
  lines.push("");
  if (args.agentResponse.trim()) {
    lines.push(args.agentResponse);
    lines.push("");
  }
  const metaParts = [
    `**Model:** \`${args.modelUsed}\``,
    `**Exit Code:** \`${args.exitCode}\``,
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
    for (const f of args.failures) lines.push(f);
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  lines.push(
    `*Triggered by ${args.actor} · [Infer Action](https://github.com/inference-gateway/infer-action)*`,
  );

  return lines.join("\n");
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

// Auto-run only as the CLI entrypoint. Vitest imports this module for its pure
// formatters (formatCost/formatMoney), so skip main() under the test runner to
// keep importing side-effect free. VITEST is never set in the action runtime,
// so production behaviour is unchanged.
if (!process.env["VITEST"]) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error("[post-results] uncaught error:", e);
      process.exit(1);
    },
  );
}

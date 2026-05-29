#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { extractFailures } from "./failures.js";
import { GithubClient } from "./github.js";
import { extractUsage, type UsageTotals } from "./usage.js";

const AGENT_OUTPUT_PATH = "/tmp/agent-output.txt";
const MAX_OUTPUT_CHARS = 40_000;

async function main(): Promise<number> {
  const token = required("GITHUB_TOKEN");
  const repo = required("INFER_REPO");
  const issueNumber = Number.parseInt(required("INFER_ISSUE_NUMBER"), 10);
  const cookingCommentIdStr = optional("INFER_COOKING_COMMENT_ID");
  const cookingCommentId = cookingCommentIdStr
    ? Number.parseInt(cookingCommentIdStr, 10)
    : 0;
  const modelUsed = optional("INFER_MODEL_USED") || "(unknown)";
  const exitCode = optional("INFER_EXIT_CODE") || "1";
  const workflowUrl = optional("INFER_WORKFLOW_URL") || "";
  const actor = optional("INFER_ACTOR") || "(unknown)";

  const github = new GithubClient({ token, repo });

  const failures = await extractFailures(AGENT_OUTPUT_PATH);
  const usage = await extractUsage(AGENT_OUTPUT_PATH);
  const agentOutputTail = await readTail(AGENT_OUTPUT_PATH, MAX_OUTPUT_CHARS);
  const footer = buildFooter({
    exitCode,
    modelUsed,
    workflowUrl,
    actor,
    failures,
    usage,
    agentOutputTail,
  });

  setOutput("failed-count", String(failures.length));
  writeStepSummary(footer);

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

  if (!patched) {
    try {
      await github.createIssueComment(issueNumber, footer);
      console.log(`Posted fallback comment to issue #${issueNumber}`);
    } catch (e) {
      console.error(
        "Fallback POST also failed; result is only in the workflow summary:",
        e,
      );
    }
  }

  // Remove the working spinner now that the run has reached a terminal state.
  // This step runs on always(), so it covers success, failure, and cancellation.
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

interface FooterArgs {
  exitCode: string;
  modelUsed: string;
  workflowUrl: string;
  actor: string;
  failures: string[];
  usage: UsageTotals;
  agentOutputTail: string;
}

function buildFooter(args: FooterArgs): string {
  const success = args.exitCode === "0";
  const statusIcon = success ? "✅" : "❌";
  const statusText = success ? "Success" : "Failed";

  const lines: string[] = [];
  lines.push(`## ${statusIcon} Infer Result: ${statusText}`);
  lines.push("");
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

  if (args.agentOutputTail.trim()) {
    lines.push("<details><summary>Agent output (tail)</summary>");
    lines.push("");
    // Four backticks so any ``` inside the agent output does not close the fence.
    lines.push("````");
    lines.push(args.agentOutputTail);
    lines.push("````");
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

async function readTail(path: string, maxChars: number): Promise<string> {
  if (!existsSync(path)) return "";
  const size = statSync(path).size;
  if (size === 0) return "";
  if (size <= maxChars) {
    return readFileSync(path, "utf8");
  }
  const fh = await open(path, "r");
  try {
    const start = size - maxChars;
    const buf = Buffer.alloc(maxChars);
    await fh.read(buf, 0, maxChars, start);
    return buf.toString("utf8");
  } finally {
    await fh.close();
  }
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

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error("[post-results] uncaught error:", e);
    process.exit(1);
  },
);

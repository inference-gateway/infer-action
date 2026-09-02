// Run judge (issue #338): an optional, feature-flagged LLM-as-a-judge pass
// over the finished run's trajectory. The digest is built from data the report
// step already computes (no raw log upload); the verdict call reuses the
// installed `infer` CLI in headless mode (all provider keys and model
// resolution come for free - no gateway is alive by the report step and the
// CLI has no one-shot completion command). Best-effort throughout: any
// failure returns null and must never touch the action's status outputs.

import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import type { ToolCallCounts, ToolFailure } from "./failures.js";
import { readJsonLines } from "./parser.js";
import { extractTranscript, type LoopSignal } from "./transcript.js";
import type { UsageTotals } from "./usage.js";

export type JudgeScore = "ok" | "degraded" | "blocked";

export interface JudgeVerdict {
  score: JudgeScore;
  blockers: string[];
  improvements: string[];
}

export interface JudgeDigest {
  result: string;
  exitCode: string;
  timedOut: boolean;
  stoppedEarly: boolean;
  durationMs: number;
  usage: UsageTotals;
  toolCallCounts: ToolCallCounts;
  failures: ToolFailure[];
  loopSignal: LoopSignal;
  stderrTail: string;
  finalResponseExcerpt: string;
}

const MAX_DIGEST_FAILURES = 20;
const MAX_FAILURE_MESSAGE_CHARS = 500;
const MAX_RESPONSE_EXCERPT_CHARS = 2000;

// Caps the variable-size digest fields so the judge prompt stays a few KB.
// Inputs are expected to be pre-redacted by the caller (report.ts redacts
// failures/response/stderr with the shared redactor before building this).
export function buildJudgeDigest(
  digest: Omit<JudgeDigest, "failures" | "finalResponseExcerpt"> & {
    failures: ToolFailure[];
    finalResponse: string;
  },
): JudgeDigest {
  const { finalResponse, failures, ...rest } = digest;
  // Failures lead the serialized digest: the judge's rubric analyses them first.
  return {
    failures: failures.slice(0, MAX_DIGEST_FAILURES).map((f) => ({
      tool: f.tool,
      message: f.message.slice(0, MAX_FAILURE_MESSAGE_CHARS),
    })),
    ...rest,
    finalResponseExcerpt: finalResponse.slice(0, MAX_RESPONSE_EXCERPT_CHARS),
  };
}

export function buildJudgePrompt(digest: JudgeDigest): string {
  return `You are a run judge evaluating the trajectory of a finished autonomous coding-agent run inside a GitHub Action. You are given a structured digest of the run (status, tool failures, per-tool call counts, token usage, loop signals, stderr tail, final response excerpt). Do not use any tools; respond with a single JSON object only, no prose, no code fences.

Method - work through the digest in this order:
1. Start with "failures" and "toolCallCounts.perToolError": group the failures by tool, and for each failing tool read its error messages to determine the root cause (permission/auth error, bad arguments, environment problem, transient flake).
2. A tool whose error count rivals its success count, or the same error recurring across calls, is systemic - report it as a blocker; a one-off failure of an otherwise-successful tool is not.
3. Then check "loopSignal" for reasoning loops, the run status/exit code, and the stderr tail for anything the tool results missed.
4. Watch for security-relevant signals throughout: what looks like a credential or token in an error message or the response excerpt (a redaction gap), the agent attempting risky or destructive commands, or failures suggesting it tried to bypass a permission boundary. Report these as blockers regardless of score.
5. Read the final response excerpt for work the agent admitted skipping - untested paths, unhandled edge cases, TODOs left behind, checks it could not run - and turn each into a concrete improvement suggestion.

Rubric:
- "ok": the run went fine; occasional recoverable tool errors are normal.
- "degraded": the run finished but with recurring problems (repeated failures of the same tool, wasted turns, an incomplete result).
- "blocked": a systemic issue prevented the run from doing its job - e.g. missing GitHub permissions (401/403 errors), a reasoning loop (high maxConsecutiveIdenticalToolCalls or maxConsecutiveAssistantTurnsWithoutTools), or a tool failing on every call.

Respond with exactly this JSON shape:
{"score": "ok" | "degraded" | "blocked", "blockers": ["systemic issues detected, empty if none"], "improvements": ["at most 3 concrete follow-up suggestions, empty if none"]}

"No findings" (score "ok", empty arrays) is a valid and expected verdict - do not invent problems.

Run digest:
${JSON.stringify(digest, null, 2)}`;
}

// Extracts the verdict JSON from the judge's response: strips code fences,
// then parses the first {...} block. Returns null on any mismatch.
export function parseVerdict(text: string): JudgeVerdict | null {
  const stripped = text.replace(/`{3,}[a-z]*\n?/gi, "").trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const score = obj["score"];
  if (score !== "ok" && score !== "degraded" && score !== "blocked")
    return null;
  return {
    score,
    blockers: stringArray(obj["blockers"]),
    improvements: stringArray(obj["improvements"]).slice(0, 3),
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && !!v.trim());
}

const JUDGE_TIMEOUT_MS = 120_000;

// Env overrides that keep the judge invocation a plain completion: no tool
// use, no conversation persistence. Viper env config takes precedence over
// any .infer/config.yaml, matching how the runner configures the agent child.
const JUDGE_TOOL_DISABLES: Record<string, string> = {
  INFER_TOOLS_BASH_ENABLED: "false",
  INFER_TOOLS_WRITE_ENABLED: "false",
  INFER_TOOLS_EDIT_ENABLED: "false",
  INFER_TOOLS_DELETE_ENABLED: "false",
  INFER_TOOLS_AGENT_ENABLED: "false",
  INFER_TOOLS_WEB_FETCH_ENABLED: "false",
  INFER_TOOLS_WEB_SEARCH_ENABLED: "false",
};

/**
 * Runs the judge as `infer headless --format json --no-save` and parses the
 * verdict out of the stream's closing assistant turns (reusing the same
 * parser + transcript extractor as the main run). Fail-soft: warns and
 * returns null on spawn failure, non-zero exit, timeout, or malformed JSON.
 */
export async function runJudge(
  model: string,
  prompt: string,
): Promise<JudgeVerdict | null> {
  let stdout: string;
  try {
    const result = spawnSync(
      "infer",
      ["headless", "--format", "json", "--no-save", "-m", model, prompt],
      {
        encoding: "utf8",
        timeout: JUDGE_TIMEOUT_MS,
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, ...JUDGE_TOOL_DISABLES },
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      console.error(
        `[report] run judge exited ${result.status}: ${(result.stderr ?? "").slice(-500)}`,
      );
      return null;
    }
    stdout = result.stdout ?? "";
  } catch (e) {
    console.error("[report] run judge failed to spawn:", e);
    return null;
  }

  const messages = [];
  for await (const msg of readJsonLines(Readable.from(stdout))) {
    messages.push(msg);
  }
  const verdict = parseVerdict(extractTranscript(messages).finalResponse);
  if (!verdict) {
    console.error("[report] run judge returned no parseable verdict");
  }
  return verdict;
}

// Markdown section for the result footer / job summary.
export function formatVerdict(verdict: JudgeVerdict): string {
  const icon =
    verdict.score === "ok" ? "✅" : verdict.score === "degraded" ? "⚠️" : "⛔";
  const lines = [`### 🧑‍⚖️ Run judge: ${icon} ${verdict.score}`, ""];
  if (verdict.blockers.length > 0) {
    lines.push("**Blockers:**");
    for (const b of verdict.blockers) lines.push(`- ${b}`);
    lines.push("");
  }
  if (verdict.improvements.length > 0) {
    lines.push("**Improvements:**");
    for (const i of verdict.improvements) lines.push(`- ${i}`);
    lines.push("");
  }
  if (verdict.blockers.length === 0 && verdict.improvements.length === 0) {
    lines.push("No findings.");
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

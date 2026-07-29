// Single-pass transcript extraction for the report step: one shared scan over
// the parsed agent stream produces the tool failures, token usage + cost, the
// per-tool call counts, and the agent's final response together. The four
// consumers used to live in separate extractors with overlapping (and
// separately maintained) parsing rules - this module is now the single
// implementation; failures.ts/usage.ts/response.ts re-export thin wrappers
// over it.
//
// The scan is two phases, not one loop, on purpose: tool-name resolution needs
// the full `tool_call_id → name` map from every assistant message before any
// tool result is judged, so a result whose call appears later in the stream
// still resolves. Each tool message's content is parsed exactly once (the old
// extractors parsed it up to three times).

import type { ToolCallCounts, ToolFailure } from "./failures.js";
import type { CostTotals, UsageTotals } from "./usage.js";
import {
  envelopeFailureMessage,
  isAssistantMessage,
  isEnvelopeFailure,
  isSessionStatsMessage,
  isToolMessage,
  parseInnerResult,
  type StreamMessage,
} from "./types.js";

export interface TranscriptExtract {
  failures: ToolFailure[];
  usage: UsageTotals;
  toolCallCounts: ToolCallCounts;
  finalResponse: string;
}

export function extractTranscript(
  messages: StreamMessage[],
): TranscriptExtract {
  const usage: UsageTotals = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requests: 0,
    toolCalls: 0,
  };
  const counts: ToolCallCounts = {
    total: 0,
    perToolSuccess: {},
    perToolError: {},
  };
  const idToName = new Map<string, string>();
  const perToolTotal: Record<string, number> = {};
  let latestCost: CostTotals | undefined;

  for (const msg of messages) {
    if (isSessionStatsMessage(msg)) {
      const c = msg.cost;
      if (c) {
        const input = numeric(c.input);
        const output = numeric(c.output);
        const total = numeric(c.total) || input + output;
        if (input > 0 || output > 0 || total > 0) {
          latestCost = {
            input,
            output,
            total,
            currency:
              typeof c.currency === "string" && c.currency ? c.currency : "USD",
          };
        }
      }
      continue;
    }
    if (!isAssistantMessage(msg)) continue;

    if (msg.tool_calls) {
      usage.toolCalls += msg.tool_calls.length;
      for (const call of msg.tool_calls) {
        if (call.id && call.function?.name) {
          idToName.set(call.id, call.function.name);
        }
        counts.total += 1;
        const name = call.function?.name || "unknown";
        perToolTotal[name] = (perToolTotal[name] ?? 0) + 1;
      }
    }

    const tokens = msg.token_usage;
    if (tokens) {
      const prompt = numeric(tokens.prompt_tokens);
      const completion = numeric(tokens.completion_tokens);
      const total = numeric(tokens.total_tokens) || prompt + completion || 0;
      if (prompt !== 0 || completion !== 0 || total !== 0) {
        usage.promptTokens += prompt;
        usage.completionTokens += completion;
        usage.totalTokens += total;
        usage.requests += 1;
      }
    }
  }
  if (latestCost) usage.cost = latestCost;

  const failures: ToolFailure[] = [];
  for (const msg of messages) {
    if (!isToolMessage(msg)) continue;

    if (isEnvelopeFailure(msg.content)) {
      const name = resolveToolName(msg.tool_call_id, idToName, undefined);
      counts.perToolError[name] = (counts.perToolError[name] ?? 0) + 1;
      const errMsg = envelopeFailureMessage(msg.content);
      if (errMsg)
        failures.push({
          tool: name,
          message: errMsg,
          ...callId(msg.tool_call_id),
        });
      continue;
    }

    const inner = parseInnerResult(msg.content);
    if (!inner || inner.success !== false) continue;
    const name = resolveToolName(msg.tool_call_id, idToName, inner.tool_name);
    counts.perToolError[name] = (counts.perToolError[name] ?? 0) + 1;
    const errMsg = pickErrorMessage(inner.error, inner.message);
    if (errMsg)
      failures.push({
        tool: name,
        message: errMsg,
        ...callId(msg.tool_call_id),
      });
  }

  for (const [tool, total] of Object.entries(perToolTotal)) {
    const errCount = counts.perToolError[tool] ?? 0;
    counts.perToolSuccess[tool] = Math.max(0, total - errCount);
  }

  return {
    failures,
    usage,
    toolCallCounts: counts,
    finalResponse: extractClosingTurns(messages),
  };
}

// Tools that don't count as "the agent is still working" - a turn that only
// calls these is bookkeeping between two halves of the same closing statement.
const BOOKKEEPING_TOOLS = new Set(["TodoWrite"]);

/**
 * The agent's closing statement, which is often split across more than one
 * assistant turn: models routinely emit the deliverable (a review, an answer)
 * and then a short wrap-up, sometimes with a TodoWrite in between. Taking only
 * the last turn dropped the deliverable and left a comment reading "see my
 * previous message" - a message nobody ever sees.
 *
 * So: walk backwards, collecting non-empty assistant `content`, and stop at the
 * first turn that called a real (non-bookkeeping) tool - that's where the work
 * ended and the narration before it begins. The last content-bearing turn is
 * always kept even if it carries tool calls of its own, since some models emit
 * prose alongside them.
 */
function extractClosingTurns(messages: StreamMessage[]): string {
  const parts: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || !isAssistantMessage(msg)) continue;
    const didWork = (msg.tool_calls ?? []).some(
      (call) => !BOOKKEEPING_TOOLS.has(call.function?.name ?? ""),
    );
    if (parts.length > 0 && didWork) break;
    const trimmed =
      typeof msg.content === "string" ? msg.content.trim() : undefined;
    if (trimmed) parts.unshift(trimmed);
  }
  return parts.join("\n\n");
}

export function extractStderrTail(raw: string, cap = 2000): string {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l[0] !== "{");
  const joined = lines.join("\n");
  return joined.length > cap ? "…" + joined.slice(-cap) : joined;
}

function resolveToolName(
  toolCallId: string | undefined,
  idToName: Map<string, string>,
  innerToolName: string | undefined,
): string {
  if (innerToolName && innerToolName.trim()) return innerToolName;
  if (toolCallId) {
    const mapped = idToName.get(toolCallId);
    if (mapped) return mapped;
  }
  return "unknown";
}

// exactOptionalPropertyTypes forbids assigning `string | undefined` to `callId?`,
// so omit the key entirely when the message carries no id.
function callId(id: string | undefined): { callId?: string } {
  return id ? { callId: id } : {};
}

function pickErrorMessage(
  error: string | undefined,
  message: string | undefined,
): string {
  if (typeof error === "string") {
    const t = error.trim();
    if (t) return t;
  }
  if (typeof message === "string") {
    const t = message.trim();
    if (t) return t;
  }
  return "";
}

function numeric(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

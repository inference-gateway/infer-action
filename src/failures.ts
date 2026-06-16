import {
  envelopeFailureMessage,
  isAssistantMessage,
  isEnvelopeFailure,
  isToolMessage,
  parseInnerResult,
  type StreamMessage,
} from "./types.js";

export interface ToolFailure {
  tool: string;
  message: string;
}

export interface ToolCallCounts {
  /** Total tool calls made by the agent. */
  total: number;
  /** Number of failed tool calls. */
  failed: number;
  /** Per-tool success count. */
  perToolSuccess: Record<string, number>;
  /** Per-tool error count. */
  perToolError: Record<string, number>;
}

/**
 * Extracts structured tool failures from the agent's JSON-line stream.
 *
 * Returns an array of `{ tool, message }` objects. The caller is responsible
 * for rendering these into markdown (e.g. `- **{tool}**: {message}`).
 */
export async function extractFailures(
  messages: StreamMessage[],
): Promise<ToolFailure[]> {
  const idToName = new Map<string, string>();
  for (const msg of messages) {
    if (!isAssistantMessage(msg) || !msg.tool_calls) continue;
    for (const call of msg.tool_calls) {
      if (call.id && call.function?.name) {
        idToName.set(call.id, call.function.name);
      }
    }
  }

  const failures: ToolFailure[] = [];
  for (const msg of messages) {
    if (!isToolMessage(msg)) continue;

    if (isEnvelopeFailure(msg.content)) {
      const errMsg = envelopeFailureMessage(msg.content);
      if (!errMsg) continue;
      const name = resolveToolName(msg.tool_call_id, idToName, undefined);
      failures.push({ tool: name, message: errMsg });
      continue;
    }

    const inner = parseInnerResult(msg.content);
    if (!inner || inner.success !== false) continue;

    const errMsg = pickErrorMessage(inner.error, inner.message);
    if (!errMsg) continue;
    const name = resolveToolName(msg.tool_call_id, idToName, inner.tool_name);
    failures.push({ tool: name, message: errMsg });
  }

  return failures;
}

/**
 * Computes per-tool call counts (total, failed, per-tool success/error).
 *
 * Reads the stream once to count all tool calls from assistant messages and
 * all failures from tool messages. The returned counts are used by both the
 * footer renderer and the OTLP exporter.
 */
export async function extractToolCallCounts(
  messages: StreamMessage[],
): Promise<ToolCallCounts> {
  const counts: ToolCallCounts = {
    total: 0,
    failed: 0,
    perToolSuccess: {},
    perToolError: {},
  };

  const idToName = new Map<string, string>();
  for (const msg of messages) {
    if (!isAssistantMessage(msg) || !msg.tool_calls) continue;
    for (const call of msg.tool_calls) {
      if (call.id && call.function?.name) {
        idToName.set(call.id, call.function.name);
      }
      counts.total += 1;
    }
  }

  for (const msg of messages) {
    if (!isToolMessage(msg)) continue;

    const isFailure =
      isEnvelopeFailure(msg.content) ||
      (() => {
        const inner = parseInnerResult(msg.content);
        return inner !== null && inner.success === false;
      })();

    if (isFailure) {
      counts.failed += 1;
      const name = resolveToolName(
        msg.tool_call_id,
        idToName,
        (() => {
          const inner = parseInnerResult(msg.content);
          return inner?.tool_name;
        })(),
      );
      counts.perToolError[name] = (counts.perToolError[name] ?? 0) + 1;
    }
  }

  const perToolTotal: Record<string, number> = {};
  for (const msg of messages) {
    if (!isAssistantMessage(msg) || !msg.tool_calls) continue;
    for (const call of msg.tool_calls) {
      const name = call.function?.name || "unknown";
      perToolTotal[name] = (perToolTotal[name] ?? 0) + 1;
    }
  }

  for (const [tool, total] of Object.entries(perToolTotal)) {
    const errCount = counts.perToolError[tool] ?? 0;
    counts.perToolSuccess[tool] = Math.max(0, total - errCount);
  }

  return counts;
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

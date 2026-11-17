import { extractTranscript } from "./transcript.js";
import type { StreamMessage } from "./types.js";

export interface ToolFailure {
  tool: string;
  message: string;
  callId?: string;
}

export interface ToolCallCounts {
  /** Total tool calls made by the agent. */
  total: number;
  /** Per-tool success count. */
  perToolSuccess: Record<string, number>;
  /** Per-tool error count. */
  perToolError: Record<string, number>;
}

/**
 * Extracts structured tool failures from the agent's JSON-line stream - an
 * array of `{ tool, message }` objects the caller renders into markdown
 * (e.g. `- **{tool}**: {message}`).
 */
export function extractFailures(messages: StreamMessage[]): ToolFailure[] {
  return extractTranscript(messages).failures;
}

/**
 * Computes per-tool call counts (total, per-tool success/error).
 */
export function extractToolCallCounts(
  messages: StreamMessage[],
): ToolCallCounts {
  return extractTranscript(messages).toolCallCounts;
}

import { extractTranscript } from "./transcript.js";
import type { StreamMessage } from "./types.js";

export interface ToolFailure {
  tool: string;
  message: string;
  callId?: string;
}

// Tool-call counts: total calls made by the agent, plus per-tool success/error.
export interface ToolCallCounts {
  total: number;
  perToolSuccess: Record<string, number>;
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

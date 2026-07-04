// Thin wrappers over the shared single-pass scan in transcript.ts — kept so
// callers (and the existing test suites) keep their per-concern entrypoints.
// The types stay here because otel.ts and report.ts import them.

import { extractTranscript } from "./transcript.js";
import type { StreamMessage } from "./types.js";

export interface ToolFailure {
  tool: string;
  message: string;
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
 * Extracts structured tool failures from the agent's JSON-line stream.
 *
 * Returns an array of `{ tool, message }` objects. The caller is responsible
 * for rendering these into markdown (e.g. `- **{tool}**: {message}`).
 */
export function extractFailures(messages: StreamMessage[]): ToolFailure[] {
  return extractTranscript(messages).failures;
}

/**
 * Computes per-tool call counts (total, per-tool success/error).
 *
 * The returned counts are used by both the footer renderer and the OTLP
 * exporter.
 */
export function extractToolCallCounts(
  messages: StreamMessage[],
): ToolCallCounts {
  return extractTranscript(messages).toolCallCounts;
}

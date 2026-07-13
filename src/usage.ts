// Thin wrapper over the shared single-pass scan in transcript.ts. The types
// stay here because report.ts imports them.

import { extractTranscript } from "./transcript.js";
import type { StreamMessage } from "./types.js";

export interface CostTotals {
  input: number;
  output: number;
  total: number;
  currency: string;
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
  toolCalls: number;
  cost?: CostTotals;
}

/**
 * Sums token usage across the agent's JSON-line stream and captures the run's
 * billed cost.
 *
 * The real `infer agent` attaches `token_usage` to each assistant completion
 * message (one per request). Each request re-bills the full prompt, so summing
 * per-turn usage yields the correct total billed token count for the run.
 *
 * Cost is not per-request: the CLI emits it once on exit as a single
 * `session_stats` line (`{"type":"session_stats",...,"cost":{...}}`). We read
 * the last such line and surface its cost only when non-zero - pricing-disabled
 * or unpriced runs report zeros, in which case `cost` is left undefined and the
 * footer omits it.
 *
 * `toolCalls` is the total number of tool calls the agent made, summed from
 * every assistant message's `tool_calls[]` (counted independently of token
 * usage, so calls on a token-less turn still count). It pairs with the footer's
 * failed-tool-call list to give a success rate.
 */
export function extractUsage(messages: StreamMessage[]): UsageTotals {
  return extractTranscript(messages).usage;
}

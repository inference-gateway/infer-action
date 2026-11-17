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
 * billed cost: the CLI attaches `token_usage` per assistant message and each
 * request re-bills the full prompt, so per-turn sums give the correct billed
 * total. Cost arrives once on exit in a `session_stats` line and is surfaced
 * only when non-zero (unpriced runs leave `cost` undefined). `toolCalls` is
 * counted independently of tokens so token-less turns still count.
 */
export function extractUsage(messages: StreamMessage[]): UsageTotals {
  return extractTranscript(messages).usage;
}

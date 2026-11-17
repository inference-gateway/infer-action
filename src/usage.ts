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
 * Sums per-turn `token_usage` across the JSON-line stream (each request re-bills
 * the full prompt, so the sum is the billed total) and takes the cost from the
 * exit `session_stats` line only when non-zero. `toolCalls` is counted apart
 * from tokens so token-less turns still count.
 */
export function extractUsage(messages: StreamMessage[]): UsageTotals {
  return extractTranscript(messages).usage;
}

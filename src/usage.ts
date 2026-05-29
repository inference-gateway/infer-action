import { createReadStream, existsSync } from "node:fs";
import { readJsonLines } from "./parser.js";
import { isAssistantMessage } from "./types.js";

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
}

/**
 * Sums token usage across the agent's JSON-line stream.
 *
 * The real `infer agent` attaches `token_usage` to each assistant completion
 * message (one per request). Each request re-bills the full prompt, so summing
 * per-turn usage yields the correct total billed token count for the run.
 */
export async function extractUsage(path: string): Promise<UsageTotals> {
  const totals: UsageTotals = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requests: 0,
  };

  if (!existsSync(path)) return totals;

  for await (const msg of readJsonLines(createReadStream(path))) {
    if (!isAssistantMessage(msg)) continue;
    const usage = msg.token_usage;
    if (!usage) continue;
    const prompt = numeric(usage.prompt_tokens);
    const completion = numeric(usage.completion_tokens);
    const total = numeric(usage.total_tokens) || prompt + completion || 0;
    if (prompt === 0 && completion === 0 && total === 0) continue;
    totals.promptTokens += prompt;
    totals.completionTokens += completion;
    totals.totalTokens += total;
    totals.requests += 1;
  }

  return totals;
}

function numeric(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

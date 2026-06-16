import { isAssistantMessage, isSessionStatsMessage, type StreamMessage } from "./types.js";

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
 * the last such line and surface its cost only when non-zero — pricing-disabled
 * or unpriced runs report zeros, in which case `cost` is left undefined and the
 * footer omits it.
 *
 * `toolCalls` is the total number of tool calls the agent made, summed from
 * every assistant message's `tool_calls[]` (counted independently of token
 * usage, so calls on a token-less turn still count). It pairs with the footer's
 * failed-tool-call list to give a success rate.
 */
export async function extractUsage(
  messages: StreamMessage[],
): Promise<UsageTotals> {
  const totals: UsageTotals = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requests: 0,
    toolCalls: 0,
  };

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
    if (msg.tool_calls) totals.toolCalls += msg.tool_calls.length;
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

  if (latestCost) totals.cost = latestCost;
  return totals;
}

function numeric(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

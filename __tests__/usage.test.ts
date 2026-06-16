import { describe, expect, it } from "bun:test";
import { extractUsage } from "../src/usage.js";
import type { StreamMessage } from "../src/types.js";

function toMessages(lines: object[]): StreamMessage[] {
  return lines as StreamMessage[];
}

describe("extractUsage", () => {
  it("sums token_usage across assistant messages", async () => {
    const messages = toMessages([
      {
        role: "assistant",
        content: "",
        token_usage: {
          prompt_tokens: 1000,
          completion_tokens: 100,
          total_tokens: 1100,
        },
        tool_calls: [{ id: "c1", function: { name: "Read" } }],
      },
      { role: "tool", content: "Result of tool call: {}", tool_call_id: "c1" },
      {
        role: "assistant",
        content: "Done.",
        token_usage: {
          prompt_tokens: 1500,
          completion_tokens: 200,
          total_tokens: 1700,
        },
      },
    ]);
    expect(await extractUsage(messages)).toEqual({
      promptTokens: 2500,
      completionTokens: 300,
      totalTokens: 2800,
      requests: 2,
      toolCalls: 1,
    });
  });

  it("ignores assistant messages without token_usage", async () => {
    const messages = toMessages([
      { role: "assistant", content: "thinking" },
      {
        role: "assistant",
        content: "done",
        token_usage: {
          prompt_tokens: 50,
          completion_tokens: 10,
          total_tokens: 60,
        },
      },
    ]);
    expect(await extractUsage(messages)).toEqual({
      promptTokens: 50,
      completionTokens: 10,
      totalTokens: 60,
      requests: 1,
      toolCalls: 0,
    });
  });

  it("derives total_tokens from prompt + completion when absent", async () => {
    const messages = toMessages([
      {
        role: "assistant",
        content: "x",
        token_usage: { prompt_tokens: 30, completion_tokens: 12 },
      },
    ]);
    expect(await extractUsage(messages)).toEqual({
      promptTokens: 30,
      completionTokens: 12,
      totalTokens: 42,
      requests: 1,
      toolCalls: 0,
    });
  });

  it("does not count non-assistant roles", async () => {
    const messages = toMessages([
      {
        role: "tool",
        content: "Result of tool call: {}",
        token_usage: { prompt_tokens: 999, total_tokens: 999 },
      },
      { role: "user", content: "hi" },
    ]);
    expect(await extractUsage(messages)).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 0,
      toolCalls: 0,
    });
  });

  it("captures cost from a session_stats line", async () => {
    const messages = toMessages([
      {
        role: "assistant",
        content: "",
        token_usage: {
          prompt_tokens: 1000,
          completion_tokens: 100,
          total_tokens: 1100,
        },
      },
      {
        type: "session_stats",
        message: "Session complete",
        model: "deepseek/deepseek-v4-flash",
        prompt_tokens: 1000,
        completion_tokens: 100,
        total_tokens: 1100,
        requests: 1,
        cost: { input: 0.678, output: 0.0021, total: 0.6801, currency: "USD" },
      },
    ]);
    expect(await extractUsage(messages)).toEqual({
      promptTokens: 1000,
      completionTokens: 100,
      totalTokens: 1100,
      requests: 1,
      toolCalls: 0,
      cost: { input: 0.678, output: 0.0021, total: 0.6801, currency: "USD" },
    });
  });

  it("omits cost when there is no session_stats line", async () => {
    const messages = toMessages([
      {
        role: "assistant",
        content: "done",
        token_usage: {
          prompt_tokens: 50,
          completion_tokens: 10,
          total_tokens: 60,
        },
      },
    ]);
    const result = await extractUsage(messages);
    expect(result).not.toHaveProperty("cost");
    expect(result).toEqual({
      promptTokens: 50,
      completionTokens: 10,
      totalTokens: 60,
      requests: 1,
      toolCalls: 0,
    });
  });

  it("omits cost when session_stats cost is all zero", async () => {
    const messages = toMessages([
      {
        role: "assistant",
        content: "",
        token_usage: {
          prompt_tokens: 50,
          completion_tokens: 10,
          total_tokens: 60,
        },
      },
      {
        type: "session_stats",
        requests: 1,
        cost: { input: 0, output: 0, total: 0, currency: "USD" },
      },
    ]);
    expect(await extractUsage(messages)).not.toHaveProperty("cost");
  });

  it("does not count session_stats tokens toward totals", async () => {
    const messages = toMessages([
      {
        role: "assistant",
        content: "",
        token_usage: {
          prompt_tokens: 200,
          completion_tokens: 20,
          total_tokens: 220,
        },
      },
      {
        type: "session_stats",
        prompt_tokens: 999999,
        completion_tokens: 999999,
        total_tokens: 1999998,
        requests: 7,
        cost: { input: 1, output: 2, total: 3, currency: "USD" },
      },
    ]);
    expect(await extractUsage(messages)).toEqual({
      promptTokens: 200,
      completionTokens: 20,
      totalTokens: 220,
      requests: 1,
      toolCalls: 0,
      cost: { input: 1, output: 2, total: 3, currency: "USD" },
    });
  });

  it("derives session_stats cost total from input + output when absent", async () => {
    const messages = toMessages([
      {
        role: "assistant",
        content: "",
        token_usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
        },
      },
      {
        type: "session_stats",
        cost: { input: 1.5, output: 2.5, currency: "USD" },
      },
    ]);
    expect((await extractUsage(messages)).cost).toEqual({
      input: 1.5,
      output: 2.5,
      total: 4,
      currency: "USD",
    });
  });

  it("defaults a missing cost currency to USD", async () => {
    const messages = toMessages([
      {
        role: "assistant",
        content: "",
        token_usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
        },
      },
      { type: "session_stats", cost: { input: 1, output: 2, total: 3 } },
    ]);
    expect((await extractUsage(messages)).cost).toEqual({
      input: 1,
      output: 2,
      total: 3,
      currency: "USD",
    });
  });

  it("keeps the last session_stats cost when several appear", async () => {
    const messages = toMessages([
      {
        type: "session_stats",
        cost: { input: 1, output: 1, total: 2, currency: "USD" },
      },
      {
        role: "assistant",
        content: "",
        token_usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
        },
      },
      {
        type: "session_stats",
        cost: { input: 5, output: 5, total: 10, currency: "EUR" },
      },
    ]);
    expect((await extractUsage(messages)).cost).toEqual({
      input: 5,
      output: 5,
      total: 10,
      currency: "EUR",
    });
  });

  it("counts every tool call summed across assistant messages", async () => {
    const messages = toMessages([
      {
        role: "assistant",
        content: "",
        token_usage: {
          prompt_tokens: 100,
          completion_tokens: 10,
          total_tokens: 110,
        },
        tool_calls: [
          { id: "c1", function: { name: "TodoWrite" } },
          { id: "c2", function: { name: "Read" } },
        ],
      },
      { role: "tool", content: "Result of tool call: {}", tool_call_id: "c1" },
      { role: "tool", content: "Result of tool call: {}", tool_call_id: "c2" },
      {
        role: "assistant",
        content: "done",
        token_usage: {
          prompt_tokens: 150,
          completion_tokens: 20,
          total_tokens: 170,
        },
        tool_calls: [{ id: "c3", function: { name: "Bash" } }],
      },
    ]);
    expect(await extractUsage(messages)).toMatchObject({ toolCalls: 3 });
  });

  it("counts parallel tool calls within a single message", async () => {
    const messages = toMessages([
      {
        role: "assistant",
        content: "",
        token_usage: {
          prompt_tokens: 100,
          completion_tokens: 10,
          total_tokens: 110,
        },
        tool_calls: [
          { id: "a", function: { name: "Read" } },
          { id: "b", function: { name: "Read" } },
          { id: "c", function: { name: "Read" } },
        ],
      },
    ]);
    expect((await extractUsage(messages)).toolCalls).toBe(3);
  });

  it("counts tool calls even when the assistant message has no token_usage", async () => {
    const messages = toMessages([
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "c1", function: { name: "Grep" } }],
      },
    ]);
    expect(await extractUsage(messages)).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 0,
      toolCalls: 1,
    });
  });

  it("does not count tool calls on non-assistant lines", async () => {
    const messages = toMessages([
      { role: "user", content: "do a thing" },
      { role: "tool", content: "Result of tool call: {}", tool_call_id: "x" },
      { type: "session_stats", cost: { input: 1, output: 1, total: 2 } },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "c1", function: { name: "Read" } }],
      },
    ]);
    expect((await extractUsage(messages)).toolCalls).toBe(1);
  });
});

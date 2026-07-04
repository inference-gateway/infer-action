import { describe, expect, it } from "bun:test";
import { extractTranscript } from "../src/transcript.js";
import type { StreamMessage } from "../src/types.js";

function toMessages(lines: object[]): StreamMessage[] {
  return lines as StreamMessage[];
}

describe("extractTranscript", () => {
  it("extracts all four concerns from one interleaved stream", () => {
    const messages = toMessages([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "WebFetch", arguments: "{}" },
          },
          {
            id: "call_2",
            type: "function",
            function: { name: "Bash", arguments: "{}" },
          },
        ],
        token_usage: { prompt_tokens: 100, completion_tokens: 20 },
      },
      {
        role: "tool",
        content: "Tool execution failed: domain not whitelisted",
        tool_call_id: "call_1",
      },
      {
        role: "tool",
        content: 'Result of tool call: {"tool_name":"Bash","success":true}',
        tool_call_id: "call_2",
      },
      {
        role: "assistant",
        content: "All done.",
        token_usage: { prompt_tokens: 150, completion_tokens: 30 },
      },
      {
        type: "session_stats",
        cost: { input: 0.01, output: 0.02, currency: "EUR" },
      },
    ]);

    expect(extractTranscript(messages)).toEqual({
      failures: [{ tool: "WebFetch", message: "domain not whitelisted" }],
      usage: {
        promptTokens: 250,
        completionTokens: 50,
        totalTokens: 300,
        requests: 2,
        toolCalls: 2,
        cost: { input: 0.01, output: 0.02, total: 0.03, currency: "EUR" },
      },
      toolCallCounts: {
        total: 2,
        perToolSuccess: { WebFetch: 0, Bash: 1 },
        perToolError: { WebFetch: 1 },
      },
      finalResponse: "All done.",
    });
  });

  it("counts an empty-message envelope failure in perToolError but not in failures", () => {
    const messages = toMessages([
      {
        role: "assistant",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "Write", arguments: "{}" },
          },
        ],
      },
      {
        role: "tool",
        content: "Tool execution failed: ",
        tool_call_id: "call_1",
      },
    ]);

    const extract = extractTranscript(messages);
    expect(extract.failures).toEqual([]);
    expect(extract.toolCallCounts.perToolError).toEqual({ Write: 1 });
    expect(extract.toolCallCounts.perToolSuccess).toEqual({ Write: 0 });
  });

  it("resolves a tool result whose call appears later in the stream", () => {
    const messages = toMessages([
      {
        role: "tool",
        content: "Tool execution failed: boom",
        tool_call_id: "call_late",
      },
      {
        role: "assistant",
        tool_calls: [
          {
            id: "call_late",
            type: "function",
            function: { name: "Edit", arguments: "{}" },
          },
        ],
      },
    ]);

    expect(extractTranscript(messages).failures).toEqual([
      { tool: "Edit", message: "boom" },
    ]);
  });

  it("returns empty defaults on an empty stream", () => {
    expect(extractTranscript([])).toEqual({
      failures: [],
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        requests: 0,
        toolCalls: 0,
      },
      toolCallCounts: { total: 0, perToolSuccess: {}, perToolError: {} },
      finalResponse: "",
    });
  });
});

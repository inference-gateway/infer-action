import { describe, expect, it } from "bun:test";
import { extractStderrTail, extractTranscript } from "../src/transcript.js";
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
      failures: [
        {
          tool: "WebFetch",
          message: "domain not whitelisted",
          callId: "call_1",
        },
      ],
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
      loopSignal: {
        maxConsecutiveIdenticalToolCalls: 1,
        maxConsecutiveAssistantTurnsWithoutTools: 1,
      },
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
      { tool: "Edit", message: "boom", callId: "call_late" },
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
      loopSignal: {
        maxConsecutiveIdenticalToolCalls: 0,
        maxConsecutiveAssistantTurnsWithoutTools: 0,
      },
    });
  });
});

describe("extractStderrTail", () => {
  it("keeps non-JSON stderr lines and drops JSON and blank lines", () => {
    const raw = [
      '{"role":"assistant","content":"hi"}',
      "",
      "   ERROR  ",
      "  Failed to send message: Post",
      '  "http://localhost:8080/v1/chat/completions?provider=ollama_cloud": context deadline exceeded.',
      '{"type":"session_stats"}',
    ].join("\n");
    expect(extractStderrTail(raw)).toBe(
      'ERROR\nFailed to send message: Post\n"http://localhost:8080/v1/chat/completions?provider=ollama_cloud": context deadline exceeded.',
    );
  });

  it("caps the result tail-biased so the final error survives", () => {
    const raw = "noise line\n".repeat(500) + "the actual error\n";
    const tail = extractStderrTail(raw, 100);
    expect(tail.length).toBeLessThanOrEqual(101);
    expect(tail.startsWith("…")).toBe(true);
    expect(tail.endsWith("the actual error")).toBe(true);
  });

  it("returns empty for a pure JSON transcript", () => {
    expect(extractStderrTail('{"role":"assistant"}\n{"role":"tool"}\n')).toBe(
      "",
    );
  });
});

describe("loopSignal", () => {
  const call = (name: string, args: string) => ({
    id: `${name}-${Math.random()}`,
    type: "function",
    function: { name, arguments: args },
  });

  it("counts back-to-back identical tool calls across turns", () => {
    const { loopSignal } = extractTranscript(
      toMessages([
        { role: "assistant", tool_calls: [call("Bash", '{"cmd":"ls"}')] },
        {
          role: "assistant",
          tool_calls: [
            call("Bash", '{"cmd":"ls"}'),
            call("Bash", '{"cmd":"ls"}'),
          ],
        },
        { role: "assistant", tool_calls: [call("Bash", '{"cmd":"pwd"}')] },
      ]),
    );
    expect(loopSignal.maxConsecutiveIdenticalToolCalls).toBe(3);
  });

  it("does not count same tool with different arguments as identical", () => {
    const { loopSignal } = extractTranscript(
      toMessages([
        { role: "assistant", tool_calls: [call("Bash", '{"cmd":"a"}')] },
        { role: "assistant", tool_calls: [call("Bash", '{"cmd":"b"}')] },
      ]),
    );
    expect(loopSignal.maxConsecutiveIdenticalToolCalls).toBe(1);
  });

  it("counts consecutive assistant turns without tool calls", () => {
    const { loopSignal } = extractTranscript(
      toMessages([
        { role: "assistant", content: "thinking" },
        { role: "assistant", content: "still thinking" },
        { role: "user", content: "reminder" },
        { role: "assistant", content: "more thinking" },
        { role: "assistant", tool_calls: [call("Bash", "{}")] },
        { role: "assistant", content: "done" },
      ]),
    );
    expect(loopSignal.maxConsecutiveAssistantTurnsWithoutTools).toBe(3);
  });

  it("is all zeros for an empty stream", () => {
    const { loopSignal } = extractTranscript(toMessages([]));
    expect(loopSignal).toEqual({
      maxConsecutiveIdenticalToolCalls: 0,
      maxConsecutiveAssistantTurnsWithoutTools: 0,
    });
  });
});

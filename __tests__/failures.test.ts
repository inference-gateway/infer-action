import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractFailures, extractToolCallCounts } from "../src/failures.js";

function writeFixture(lines: object[]): string {
  const dir = mkdtempSync(join(tmpdir(), "infer-failures-"));
  const path = join(dir, "agent-output.txt");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return path;
}

describe("extractFailures", () => {
  it("returns [] for missing file", async () => {
    expect(await extractFailures("/tmp/__does_not_exist__.txt")).toEqual([]);
  });

  it("drops envelope failures with an empty message", async () => {
    const path = writeFixture([
      { role: "tool", content: "Tool execution failed: ", tool_call_id: "a1" },
      { role: "tool", content: "Tool execution failed:", tool_call_id: "a2" },
    ]);
    expect(await extractFailures(path)).toEqual([]);
  });

  it("resolves tool name from assistant tool_calls via tool_call_id", async () => {
    const path = writeFixture([
      {
        role: "assistant",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "WebFetch", arguments: "{}" },
          },
        ],
      },
      {
        role: "tool",
        content:
          "Tool execution failed: URL validation failed: domain not whitelisted",
        tool_call_id: "call_1",
      },
    ]);
    expect(await extractFailures(path)).toEqual([
      { tool: "WebFetch", message: "URL validation failed: domain not whitelisted" },
    ]);
  });

  it("handles inner success:false envelopes with tool_name", async () => {
    const path = writeFixture([
      {
        role: "tool",
        content:
          'Result of tool call: {"tool_name":"Bash","success":false,"error":"command not whitelisted"}',
        tool_call_id: "call_2",
      },
    ]);
    expect(await extractFailures(path)).toEqual([
      { tool: "Bash", message: "command not whitelisted" },
    ]);
  });

  it("drops inner failures with no error/message text", async () => {
    const path = writeFixture([
      {
        role: "tool",
        content: 'Result of tool call: {"tool_name":"X","success":false}',
      },
    ]);
    expect(await extractFailures(path)).toEqual([]);
  });

  it("skips successful tool results", async () => {
    const path = writeFixture([
      {
        role: "tool",
        content:
          'Result of tool call: {"tool_name":"Read","success":true,"data":{}}',
      },
    ]);
    expect(await extractFailures(path)).toEqual([]);
  });

  it('falls back to "unknown" when no name is available', async () => {
    const path = writeFixture([
      { role: "tool", content: "Tool execution failed: something broke" },
    ]);
    expect(await extractFailures(path)).toEqual([
      { tool: "unknown", message: "something broke" },
    ]);
  });

  it("mixes envelope failures and inner failures correctly", async () => {
    const path = writeFixture([
      {
        role: "assistant",
        tool_calls: [
          { id: "c1", function: { name: "WebFetch" } },
          { id: "c2", function: { name: "Bash" } },
        ],
      },
      {
        role: "tool",
        content: "Tool execution failed: blocked URL",
        tool_call_id: "c1",
      },
      {
        role: "tool",
        content:
          'Result of tool call: {"tool_name":"Bash","success":false,"error":"denied"}',
        tool_call_id: "c2",
      },
      { role: "tool", content: "Tool execution failed: ", tool_call_id: "c1" },
      {
        role: "tool",
        content:
          'Result of tool call: {"tool_name":"Read","success":true,"data":{}}',
      },
    ]);
    expect(await extractFailures(path)).toEqual([
      { tool: "WebFetch", message: "blocked URL" },
      { tool: "Bash", message: "denied" },
    ]);
  });
});

describe("extractToolCallCounts", () => {
  it("returns zeros for missing file", async () => {
    const result = await extractToolCallCounts("/tmp/__does_not_exist__.txt");
    expect(result).toEqual({
      total: 0,
      failed: 0,
      perToolSuccess: {},
      perToolError: {},
    });
  });

  it("counts total and failed tool calls", async () => {
    const path = writeFixture([
      {
        role: "assistant",
        tool_calls: [
          { id: "c1", function: { name: "TodoWrite" } },
          { id: "c2", function: { name: "Read" } },
        ],
      },
      {
        role: "tool",
        content: 'Result of tool call: {"tool_name":"TodoWrite","success":true}',
        tool_call_id: "c1",
      },
      {
        role: "tool",
        content: "Tool execution failed: blocked",
        tool_call_id: "c2",
      },
      {
        role: "assistant",
        tool_calls: [{ id: "c3", function: { name: "Bash" } }],
      },
      {
        role: "tool",
        content:
          'Result of tool call: {"tool_name":"Bash","success":false,"error":"denied"}',
        tool_call_id: "c3",
      },
    ]);
    const result = await extractToolCallCounts(path);
    expect(result.total).toBe(3);
    expect(result.failed).toBe(2);
    expect(result.perToolError).toEqual({
      Read: 1,
      Bash: 1,
    });
    expect(result.perToolSuccess).toEqual({
      TodoWrite: 1,
      Read: 0,
      Bash: 0,
    });
  });

  it("handles empty stream with no tool calls", async () => {
    const path = writeFixture([
      { role: "assistant", content: "Nothing to do." },
    ]);
    const result = await extractToolCallCounts(path);
    expect(result.total).toBe(0);
    expect(result.failed).toBe(0);
  });
});

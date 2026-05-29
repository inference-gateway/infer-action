import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractUsage } from "../src/usage.js";

function writeFixture(lines: object[]): string {
  const dir = mkdtempSync(join(tmpdir(), "infer-usage-"));
  const path = join(dir, "agent-output.txt");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return path;
}

describe("extractUsage", () => {
  it("returns zeros for a missing file", async () => {
    expect(await extractUsage("/tmp/__does_not_exist__.txt")).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 0,
    });
  });

  it("sums token_usage across assistant messages", async () => {
    const path = writeFixture([
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
    expect(await extractUsage(path)).toEqual({
      promptTokens: 2500,
      completionTokens: 300,
      totalTokens: 2800,
      requests: 2,
    });
  });

  it("ignores assistant messages without token_usage", async () => {
    const path = writeFixture([
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
    expect(await extractUsage(path)).toEqual({
      promptTokens: 50,
      completionTokens: 10,
      totalTokens: 60,
      requests: 1,
    });
  });

  it("derives total_tokens from prompt + completion when absent", async () => {
    const path = writeFixture([
      {
        role: "assistant",
        content: "x",
        token_usage: { prompt_tokens: 30, completion_tokens: 12 },
      },
    ]);
    expect(await extractUsage(path)).toEqual({
      promptTokens: 30,
      completionTokens: 12,
      totalTokens: 42,
      requests: 1,
    });
  });

  it("does not count non-assistant roles", async () => {
    const path = writeFixture([
      {
        role: "tool",
        content: "Result of tool call: {}",
        token_usage: { prompt_tokens: 999, total_tokens: 999 },
      },
      { role: "user", content: "hi" },
    ]);
    expect(await extractUsage(path)).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 0,
    });
  });
});

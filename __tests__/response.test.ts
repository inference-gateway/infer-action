import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractFinalResponse } from "../src/response.js";

function writeFixture(lines: object[]): string {
  const dir = mkdtempSync(join(tmpdir(), "infer-response-"));
  const path = join(dir, "agent-output.txt");
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return path;
}

describe("extractFinalResponse", () => {
  it("returns empty string for a missing file", async () => {
    expect(await extractFinalResponse("/tmp/__does_not_exist__.txt")).toBe("");
  });

  it("returns the last non-empty assistant content after a tool-call turn", async () => {
    const path = writeFixture([
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "c1", function: { name: "Read" } }],
      },
      { role: "tool", content: "Result of tool call: {}", tool_call_id: "c1" },
      { role: "assistant", content: "Done. Added hello.txt." },
    ]);
    expect(await extractFinalResponse(path)).toBe("Done. Added hello.txt.");
  });

  it("skips empty- and whitespace-only content turns", async () => {
    const path = writeFixture([
      { role: "assistant", content: "The real summary." },
      { role: "assistant", content: "" },
      { role: "assistant", content: "   \n  " },
    ]);
    expect(await extractFinalResponse(path)).toBe("The real summary.");
  });

  it("captures a final turn that also carries tool_calls", async () => {
    // Some models emit prose alongside tool calls; the closing text must still
    // be picked, so selection is by non-empty content, not absence of tools.
    const path = writeFixture([
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "c1", function: { name: "Read" } }],
      },
      { role: "tool", content: "Result of tool call: {}", tool_call_id: "c1" },
      {
        role: "assistant",
        content: "Summary: all good.",
        tool_calls: [{ id: "c2", function: { name: "Read" } }],
      },
    ]);
    expect(await extractFinalResponse(path)).toBe("Summary: all good.");
  });

  it("ignores non-assistant roles and session_stats lines", async () => {
    const path = writeFixture([
      { role: "user", content: "do a thing" },
      { role: "tool", content: "Result of tool call: {}", tool_call_id: "x" },
      { role: "system", content: "you are an agent" },
      { type: "session_stats", cost: { input: 1, output: 1, total: 2 } },
    ]);
    expect(await extractFinalResponse(path)).toBe("");
  });

  it("does not throw on an assistant message with no content field", async () => {
    const path = writeFixture([
      {
        role: "assistant",
        tool_calls: [{ id: "c1", function: { name: "Grep" } }],
      },
      { role: "assistant", content: "Final." },
    ]);
    expect(await extractFinalResponse(path)).toBe("Final.");
  });

  it("returns the last when several assistant messages carry text", async () => {
    const path = writeFixture([
      { role: "assistant", content: "first" },
      { role: "assistant", content: "second" },
      { role: "assistant", content: "third" },
    ]);
    expect(await extractFinalResponse(path)).toBe("third");
  });

  it("trims surrounding whitespace from the returned text", async () => {
    const path = writeFixture([{ role: "assistant", content: "  Done.  \n" }]);
    expect(await extractFinalResponse(path)).toBe("Done.");
  });

  it("replays a realistic release-run stream and returns the closing recap", async () => {
    const recap =
      "The task is complete. Here's a recap:\n\n### What was accomplished\n\nReviewed PR #144.";
    const path = writeFixture([
      { role: "user", content: "review PR #144" },
      {
        role: "assistant",
        content: "",
        reasoning_content: "Let me check the branch and CI status.",
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: { name: "Bash", arguments: "{}" },
          },
        ],
        token_usage: {
          prompt_tokens: 100,
          completion_tokens: 10,
          total_tokens: 110,
        },
      },
      {
        role: "tool",
        tool_call_id: "c1",
        content: 'Result of tool call: {"tool_name":"Bash","success":true}',
      },
      {
        role: "assistant",
        content: "## PR #144 Review Summary\n\n**✅ Ready to merge.**",
        reasoning_content: "Now let me write the final report.",
        tool_calls: [
          {
            id: "c2",
            type: "function",
            function: { name: "TodoWrite", arguments: "{}" },
          },
        ],
        token_usage: {
          prompt_tokens: 200,
          completion_tokens: 20,
          total_tokens: 220,
        },
      },
      {
        role: "tool",
        tool_call_id: "c2",
        content:
          'Result of tool call: {"tool_name":"TodoWrite","success":true}',
      },
      {
        role: "assistant",
        content: recap,
        reasoning_content: "The user is asking if anything else is needed.",
        token_usage: {
          prompt_tokens: 300,
          completion_tokens: 30,
          total_tokens: 330,
        },
      },
      {
        type: "session_stats",
        message: "Session complete",
        model: "deepseek/deepseek-v4-flash",
        prompt_tokens: 600,
        completion_tokens: 60,
        total_tokens: 660,
        requests: 3,
        cost: { input: 0.04, output: 0.001, total: 0.041, currency: "USD" },
      },
    ]);
    expect(await extractFinalResponse(path)).toBe(recap);
  });
});

import { describe, expect, it, spyOn } from "bun:test";
import { Ticker } from "../src/ticker.js";
import type {
  InnerToolResult,
  StreamMessage,
  ToolMessage,
} from "../src/types.js";

async function* gen(msgs: StreamMessage[]): AsyncGenerator<StreamMessage> {
  for (const m of msgs) yield m;
}

function todoToolMessage(): ToolMessage {
  return {
    role: "tool",
    content:
      "Result of tool call: " +
      JSON.stringify({
        tool_name: "TodoWrite",
        success: true,
        data: { todos: [] },
      }),
  };
}

describe("Ticker.onMessage", () => {
  it("fires for every message; the tool handler still only sees matching tool messages", async () => {
    const ticker = new Ticker();
    const seen: string[] = [];
    let todoCalls = 0;
    ticker.onMessage((m) => {
      seen.push(
        (m as { type?: string }).type ?? (m as { role?: string }).role ?? "?",
      );
    });
    ticker.on("TodoWrite", (_inner: InnerToolResult) => {
      todoCalls += 1;
    });

    await ticker.observe(
      gen([
        { type: "compaction_started" },
        { role: "assistant", content: "" },
        todoToolMessage(),
        { type: "compaction_completed" },
      ]),
    );

    expect(seen).toEqual([
      "compaction_started",
      "assistant",
      "tool",
      "compaction_completed",
    ]);
    expect(todoCalls).toBe(1);
  });

  it("a throwing listener does not abort observe or other listeners", async () => {
    const ticker = new Ticker();
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    let reached = false;
    ticker
      .onMessage(() => {
        throw new Error("boom");
      })
      .onMessage(() => {
        reached = true;
      });

    await ticker.observe(gen([{ type: "compaction_started" }]));

    expect(reached).toBe(true);
    errSpy.mockRestore();
  });
});

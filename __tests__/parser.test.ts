import { Readable } from "node:stream";
import { describe, expect, it } from "bun:test";
import { readJsonLines } from "../src/parser.js";
import type { StreamMessage } from "../src/types.js";

async function collect(lines: string[]): Promise<StreamMessage[]> {
  const input = Readable.from(lines.map((l) => l + "\n"));
  const out: StreamMessage[] = [];
  for await (const msg of readJsonLines(input)) out.push(msg);
  return out;
}

const typeOf = (m: StreamMessage): string | undefined =>
  (m as { type?: string }).type;

describe("readJsonLines", () => {
  it("yields role-keyed messages", async () => {
    const out = await collect([
      JSON.stringify({ role: "assistant", content: "hi" }),
      JSON.stringify({ role: "tool", content: "x" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("yields session_stats and the compaction lifecycle events", async () => {
    const out = await collect([
      JSON.stringify({ type: "session_stats", total_tokens: 5 }),
      JSON.stringify({ type: "compaction_started" }),
      JSON.stringify({ type: "compaction_completed" }),
    ]);
    expect(out.map(typeOf)).toEqual([
      "session_stats",
      "compaction_started",
      "compaction_completed",
    ]);
  });

  it("drops unknown type-keyed objects but keeps role-keyed ones", async () => {
    const out = await collect([
      JSON.stringify({ type: "something_else" }),
      JSON.stringify({ role: "user", content: "kept" }),
    ]);
    expect(out).toHaveLength(1);
    expect((out[0] as { content?: string }).content).toBe("kept");
  });

  it("skips blank lines and non-JSON / non-object noise", async () => {
    const out = await collect([
      "",
      "not json at all",
      "[1,2,3]",
      "  ",
      JSON.stringify({ role: "assistant", content: "only me" }),
    ]);
    expect(out).toHaveLength(1);
    expect((out[0] as { content?: string }).content).toBe("only me");
  });
});

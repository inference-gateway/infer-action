import { describe, expect, test } from "bun:test";
import { Readable } from "node:stream";
import { readJsonLines } from "../src/parser.js";
import type { StreamMessage } from "../src/types.js";

async function collect(text: string): Promise<StreamMessage[]> {
  const out: StreamMessage[] = [];
  for await (const msg of readJsonLines(Readable.from([text]))) {
    out.push(msg);
  }
  return out;
}

describe("readJsonLines", () => {
  test("parses compact json lines", async () => {
    const msgs = await collect(
      '{"role":"assistant","content":"hi"}\n' +
        '{"type":"session_stats","total_tokens":5}\n',
    );
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe("assistant");
  });

  test("parses json-pretty multiline objects", async () => {
    const pretty = [
      "{",
      '  "content": "hello",',
      '  "role": "assistant",',
      '  "token_usage": {',
      '    "total_tokens": 15',
      "  }",
      "}",
      "{",
      '  "type": "session_stats",',
      '  "total_tokens": 15',
      "}",
      "",
    ].join("\n");
    const msgs = await collect(pretty);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe("assistant");
    expect(msgs[0]?.content).toBe("hello");
    expect(msgs[1]?.type).toBe("session_stats");
  });

  test("mixes compact and pretty framings", async () => {
    const mixed =
      '{"role":"tool","content":"Result of tool call: {}"}\n' +
      '{\n  "role": "assistant",\n  "content": "done"\n}\n';
    const msgs = await collect(mixed);
    expect(msgs).toHaveLength(2);
    expect(msgs[1]?.content).toBe("done");
  });

  test("drops an unterminated pretty object at EOF", async () => {
    const truncated = '{\n  "role": "assistant",\n  "content": "cut off';
    expect(await collect(truncated)).toHaveLength(0);
  });

  test("skips banners and non-message json", async () => {
    const noise =
      "Gateway is already running\n" +
      '{"unrelated":true}\n' +
      '{"role":"assistant","content":"hi"}\n';
    const msgs = await collect(noise);
    expect(msgs).toHaveLength(1);
  });
});

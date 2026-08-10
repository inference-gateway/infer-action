import { createReadStream, existsSync } from "node:fs";
import readline from "node:readline";
import type { Readable } from "node:stream";
import type { StreamMessage } from "./types.js";

/**
 * Reads a JSON-line file into an in-memory array of StreamMessage objects.
 * Returns an empty array when the file does not exist.
 *
 * Use this when you need random access to the full message stream (e.g. the
 * two-pass extractors in failures.ts). For single-pass streaming, use the
 * readJsonLines generator directly.
 */
export async function parseAgentOutput(path: string): Promise<StreamMessage[]> {
  if (!existsSync(path)) return [];
  const messages: StreamMessage[] = [];
  for await (const msg of readJsonLines(createReadStream(path))) {
    messages.push(msg);
  }
  return messages;
}

/**
 * Streams StreamMessage objects from the agent's stdout.
 *
 * Handles both output framings of `infer headless`:
 *  - `json`: one compact object per line
 *  - `json-pretty` (the format the action spawns): objects indented across
 *    multiple lines. Go's MarshalIndent puts the opening `{` and closing `}`
 *    at column 0 and JSON strings cannot contain raw newlines, so a bare
 *    `{` line opens an object and the next bare `}` line closes it.
 *
 * An unterminated pretty object at EOF (truncated transcript from a killed
 * run) is dropped silently, matching the per-line parse-failure behavior.
 */
export async function* readJsonLines(
  input: Readable,
): AsyncGenerator<StreamMessage> {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let pretty: string[] | null = null;
  for await (const line of rl) {
    if (pretty) {
      pretty.push(line);
      if (line === "}") {
        const msg = toStreamMessage(pretty.join("\n"));
        pretty = null;
        if (msg) yield msg;
      }
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === "{") {
      pretty = [trimmed];
      continue;
    }
    if (trimmed[0] !== "{") continue;
    const msg = toStreamMessage(trimmed);
    if (msg) yield msg;
  }
}

function toStreamMessage(raw: string): StreamMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const role = (parsed as { role?: unknown }).role;
    const type = (parsed as { type?: unknown }).type;
    if (
      typeof role === "string" ||
      type === "session_stats" ||
      type === "compaction_started" ||
      type === "compaction_completed"
    ) {
      return parsed as StreamMessage;
    }
    return null;
  } catch {
    // Non-JSON lines (e.g. CLI banners, progress dots) are skipped silently.
    return null;
  }
}

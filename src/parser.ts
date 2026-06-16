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

export async function* readJsonLines(
  input: Readable,
): AsyncGenerator<StreamMessage> {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed[0] !== "{") continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (typeof parsed !== "object" || parsed === null) continue;
      const role = (parsed as { role?: unknown }).role;
      const type = (parsed as { type?: unknown }).type;
      if (
        typeof role === "string" ||
        type === "session_stats" ||
        type === "compaction_started" ||
        type === "compaction_completed"
      ) {
        yield parsed as StreamMessage;
      }
    } catch {
      // Non-JSON lines (e.g. CLI banners, progress dots) are skipped silently.
    }
  }
}

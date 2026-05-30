import readline from "node:readline";
import type { Readable } from "node:stream";
import type { StreamMessage } from "./types.js";

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
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        (typeof (parsed as { role?: unknown }).role === "string" ||
          (parsed as { type?: unknown }).type === "session_stats")
      ) {
        yield parsed as StreamMessage;
      }
    } catch {
      // Non-JSON lines (e.g. CLI banners, progress dots) are skipped silently.
    }
  }
}

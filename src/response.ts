import { extractTranscript } from "./transcript.js";
import type { StreamMessage } from "./types.js";

/**
 * Extracts the agent's final human-facing response from the JSON-line stream:
 * concluding assistant turns fill `content` with the deliverable (tool-call
 * turns are usually bare; the thinking lands in reasoning_content, ignored) and
 * are often SPLIT across several turns, so every trailing assistant text turn
 * is joined by blank lines up to the last real tool call - "" when the stream
 * has no assistant text at all (the caller then omits the section).
 */
export function extractFinalResponse(messages: StreamMessage[]): string {
  return extractTranscript(messages).finalResponse;
}

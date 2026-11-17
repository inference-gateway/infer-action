import { extractTranscript } from "./transcript.js";
import type { StreamMessage } from "./types.js";

/**
 * Extracts the agent's final human-facing response from the JSON-line stream by
 * joining every trailing assistant text turn up to the last real tool call, since
 * the deliverable is often split across turns. Returns "" when the stream has no
 * assistant text, so the caller omits the section.
 */
export function extractFinalResponse(messages: StreamMessage[]): string {
  return extractTranscript(messages).finalResponse;
}

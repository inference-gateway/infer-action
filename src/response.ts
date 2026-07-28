// Thin wrapper over the shared single-pass scan in transcript.ts.

import { extractTranscript } from "./transcript.js";
import type { StreamMessage } from "./types.js";

/**
 * Extracts the agent's final human-facing response from the JSON-line stream.
 *
 * The `infer agent` stream interleaves tool-call turns with concluding turns.
 * On a tool-call turn the assistant message usually carries an empty `content`
 * (the model's thinking, when present, lands in a separate `reasoning_content`
 * field we deliberately ignore); the concluding turns fill `content` with the
 * deliverable.
 *
 * That closing statement is frequently SPLIT across several turns - a review
 * followed by a short wrap-up, often with a TodoWrite between them - so we
 * return every trailing assistant text turn joined by blank lines, stopping at
 * the last turn that called a real tool. Anything before that is narration for
 * work in progress, not part of the answer. Returns "" when the stream has no
 * assistant text at all (e.g. the agent crashed before concluding) - the caller
 * then omits the section.
 */
export function extractFinalResponse(messages: StreamMessage[]): string {
  return extractTranscript(messages).finalResponse;
}

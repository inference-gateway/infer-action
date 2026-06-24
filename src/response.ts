import { isAssistantMessage, type StreamMessage } from "./types.js";

/**
 * Extracts the agent's final human-facing response from the JSON-line stream.
 *
 * The `infer agent` stream interleaves tool-call turns with a concluding turn.
 * On a tool-call turn the assistant message carries an empty `content` (the
 * model's thinking, when present, lands in a separate `reasoning_content` field
 * we deliberately ignore); the concluding turn fills `content` with the closing
 * summary. We therefore return the `content` of the LAST assistant message whose
 * trimmed text is non-empty.
 *
 * Selection is by non-empty `content` alone, independent of `tool_calls`: some
 * models emit a turn that carries both prose and tool calls, and a real run can
 * end with a trailing tool turn or a `session_stats`-only line, so "last
 * non-empty content" is more robust than "last message" or "last turn without
 * tool calls". Returns "" when the stream has no assistant text at all (e.g. the
 * agent crashed before concluding) - the caller then omits the section.
 */
export function extractFinalResponse(messages: StreamMessage[]): string {
  let last = "";
  for (const msg of messages) {
    if (!isAssistantMessage(msg)) continue;
    const content = msg.content;
    if (typeof content !== "string") continue;
    const trimmed = content.trim();
    if (trimmed) last = trimmed;
  }
  return last;
}

import { createReadStream, existsSync } from "node:fs";
import { readJsonLines } from "./parser.js";
import {
  envelopeFailureMessage,
  isAssistantMessage,
  isEnvelopeFailure,
  isToolMessage,
  parseInnerResult,
  type StreamMessage,
} from "./types.js";

export async function extractFailures(path: string): Promise<string[]> {
  if (!existsSync(path)) return [];

  const messages: StreamMessage[] = [];
  for await (const msg of readJsonLines(createReadStream(path))) {
    messages.push(msg);
  }

  const idToName = new Map<string, string>();
  for (const msg of messages) {
    if (!isAssistantMessage(msg) || !msg.tool_calls) continue;
    for (const call of msg.tool_calls) {
      if (call.id && call.function?.name) {
        idToName.set(call.id, call.function.name);
      }
    }
  }

  const failures: string[] = [];
  for (const msg of messages) {
    if (!isToolMessage(msg)) continue;

    if (isEnvelopeFailure(msg.content)) {
      const errMsg = envelopeFailureMessage(msg.content);
      if (!errMsg) continue;
      const name = resolveToolName(msg.tool_call_id, idToName, undefined);
      failures.push(`- **${name}**: ${errMsg}`);
      continue;
    }

    const inner = parseInnerResult(msg.content);
    if (!inner || inner.success !== false) continue;

    const errMsg = pickErrorMessage(inner.error, inner.message);
    if (!errMsg) continue;
    const name = resolveToolName(msg.tool_call_id, idToName, inner.tool_name);
    failures.push(`- **${name}**: ${errMsg}`);
  }

  return failures;
}

function resolveToolName(
  toolCallId: string | undefined,
  idToName: Map<string, string>,
  innerToolName: string | undefined,
): string {
  if (innerToolName && innerToolName.trim()) return innerToolName;
  if (toolCallId) {
    const mapped = idToName.get(toolCallId);
    if (mapped) return mapped;
  }
  return "unknown";
}

function pickErrorMessage(
  error: string | undefined,
  message: string | undefined,
): string {
  if (typeof error === "string") {
    const t = error.trim();
    if (t) return t;
  }
  if (typeof message === "string") {
    const t = message.trim();
    if (t) return t;
  }
  return "";
}

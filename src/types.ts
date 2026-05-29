export type TodoStatus = "pending" | "in_progress" | "completed";

export interface Todo {
  id: string;
  content: string;
  status: TodoStatus;
}

export interface ToolCall {
  id: string;
  type?: string;
  function: {
    name: string;
    arguments?: string;
  };
}

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface AssistantMessage {
  role: "assistant";
  content?: string;
  tool_calls?: ToolCall[];
  token_usage?: TokenUsage;
  timestamp?: string;
}

export interface ToolMessage {
  role: "tool";
  content: string;
  tool_call_id?: string;
  timestamp?: string;
}

export interface UserMessage {
  role: "user";
  content: string;
  timestamp?: string;
}

export interface SystemMessage {
  role: "system";
  content: string;
  timestamp?: string;
}

export type StreamMessage =
  | AssistantMessage
  | ToolMessage
  | UserMessage
  | SystemMessage;

export interface InnerToolResult {
  tool_name?: string;
  success?: boolean;
  error?: string;
  message?: string;
  duration?: number;
  data?: {
    todos?: Todo[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function isAssistantMessage(msg: unknown): msg is AssistantMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { role?: unknown }).role === "assistant"
  );
}

export function isToolMessage(msg: unknown): msg is ToolMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { role?: unknown }).role === "tool" &&
    typeof (msg as { content?: unknown }).content === "string"
  );
}

const RESULT_PREFIX = "Result of tool call: ";
const FAILURE_PREFIX = "Tool execution failed:";

export function parseInnerResult(content: string): InnerToolResult | null {
  if (!content.startsWith(RESULT_PREFIX)) return null;
  const json = content.slice(RESULT_PREFIX.length);
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as InnerToolResult;
    }
    return null;
  } catch {
    return null;
  }
}

export function isEnvelopeFailure(content: string): boolean {
  return content.startsWith(FAILURE_PREFIX);
}

export function envelopeFailureMessage(content: string): string {
  if (!isEnvelopeFailure(content)) return "";
  return content.slice(FAILURE_PREFIX.length).trim();
}

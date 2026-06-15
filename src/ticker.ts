import {
  isToolMessage,
  parseInnerResult,
  type InnerToolResult,
  type StreamMessage,
  type ToolMessage,
} from "./types.js";

export type Handler = (
  inner: InnerToolResult,
  raw: ToolMessage,
) => Promise<void> | void;

export type Flusher = () => Promise<void>;

export type MessageListener = (msg: StreamMessage) => void;

export class Ticker {
  private readonly handlers = new Map<string, Handler>();
  private readonly flushers: Flusher[] = [];
  private readonly listeners: MessageListener[] = [];

  on(toolName: string, handler: Handler): this {
    this.handlers.set(toolName, handler);
    return this;
  }

  // Fires for EVERY stream message before the tool-message gate in observe(),
  // so the runner can surface non-tool events (e.g. compaction lifecycle) that
  // the per-tool dispatch would otherwise skip.
  onMessage(listener: MessageListener): this {
    this.listeners.push(listener);
    return this;
  }

  addFlusher(flusher: Flusher): this {
    this.flushers.push(flusher);
    return this;
  }

  async observe(messages: AsyncIterable<StreamMessage>): Promise<void> {
    for await (const msg of messages) {
      for (const listener of this.listeners) {
        try {
          listener(msg);
        } catch (e) {
          console.error("[ticker] message listener threw:", e);
        }
      }
      if (!isToolMessage(msg)) continue;
      const inner = parseInnerResult(msg.content);
      if (!inner?.tool_name) continue;
      const handler = this.handlers.get(inner.tool_name);
      if (!handler) continue;
      try {
        await handler(inner, msg);
      } catch (e) {
        console.error(`[ticker] handler for ${inner.tool_name} threw:`, e);
      }
    }
  }

  async flush(): Promise<void> {
    for (const flusher of this.flushers) {
      try {
        await flusher();
      } catch (e) {
        console.error("[ticker] flusher threw:", e);
      }
    }
  }
}

export interface ThrottledLatest<T> {
  call: (value: T) => void;
  flush: () => Promise<void>;
}

export function throttleLatest<T>(
  fn: (value: T) => Promise<void>,
  delayMs: number,
): ThrottledLatest<T> {
  let latest: { value: T } | null = null;
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<void> | null = null;

  const fire = async (): Promise<void> => {
    timer = null;
    if (!latest) return;
    const value = latest.value;
    latest = null;
    inFlight = fn(value)
      .catch((e) => {
        console.error("[throttle] fn threw:", e);
      })
      .finally(() => {
        inFlight = null;
      });
    await inFlight;
  };

  return {
    call(value: T): void {
      latest = { value };
      if (!timer) {
        timer = setTimeout(() => {
          void fire();
        }, delayMs);
      }
    },
    async flush(): Promise<void> {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (latest) {
        await fire();
      } else if (inFlight) {
        await inFlight;
      }
    },
  };
}

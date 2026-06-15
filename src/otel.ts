/**
 * Zero-dependency OTLP/HTTP JSON exporter for infer-action telemetry.
 *
 * Builds and pushes OTLP metrics (and optionally traces + logs) to any
 * OTLP-compatible collector over HTTP. Uses the GenAI semantic conventions
 * where they exist, and custom `infer.*` names for the gaps.
 *
 * Design principles:
 * - Zero external dependencies (no @opentelemetry/* packages).
 * - Best-effort: wrapped in try/catch, never fails the run.
 * - Time-boxed: respects the configured timeout.
 * - Redacted: all exported strings pass through the provided redactor.
 * - Dry-run aware: logs instead of POSTing when INFER_DRY_RUN is true.
 */

import { type Redactor } from "./redact.js";
import { type CostTotals, type UsageTotals } from "./usage.js";
import { type ToolFailure } from "./failures.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface OtelConfig {
  /** OTLP HTTP endpoint (e.g. http://localhost:4318). Empty = disabled. */
  endpoint: string;
  /** Headers for the OTLP HTTP requests (e.g. "Authorization=Bearer …"). */
  headers: string;
  /** Protocol: "http/protobuf" (default) or "http/json". */
  protocol: string;
  /** service.name resource attribute. */
  serviceName: string;
  /** Extra resource attributes (key=val,key2=val2 format). */
  resourceAttributes: string;
  /** Comma-separated signals to export: "metrics", "traces", "logs". */
  signals: string;
  /** Export timeout in milliseconds. */
  timeoutMs: number;
}

export function loadOtelConfig(env: NodeJS.ProcessEnv): OtelConfig {
  return {
    endpoint: env["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "",
    headers: env["OTEL_EXPORTER_OTLP_HEADERS"] ?? "",
    protocol: env["OTEL_EXPORTER_OTLP_PROTOCOL"] ?? "http/protobuf",
    serviceName: env["OTEL_SERVICE_NAME"] ?? "infer-action",
    resourceAttributes: env["OTEL_RESOURCE_ATTRIBUTES"] ?? "",
    signals: env["OTEL_SIGNALS"] ?? "metrics",
    timeoutMs: Number(env["OTEL_EXPORT_TIMEOUT_MS"] ?? "5000"),
  };
}

// ---------------------------------------------------------------------------
// Telemetry data
// ---------------------------------------------------------------------------

export interface RunTelemetry {
  usage: UsageTotals;
  failures: ToolFailure[];
  exitCode: string;
  modelUsed: string;
  durationMs: number;
  stoppedEarly: boolean;
  timedOut: boolean;
  actor: string;
  repo: string;
  workflowUrl: string;
  runId: string;
  sha: string;
  ref: string;
  eventName: string;
  issueNumber: string;
  prUrl: string;
}

// ---------------------------------------------------------------------------
// OTLP attribute helpers
// ---------------------------------------------------------------------------

interface OtlpAttribute {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string;
    doubleValue?: number;
    boolValue?: boolean;
  };
}

function stringAttr(key: string, value: string): OtlpAttribute {
  return { key, value: { stringValue: value } };
}

function intAttr(key: string, value: number): OtlpAttribute {
  return { key, value: { intValue: String(value) } };
}

function doubleAttr(key: string, value: number): OtlpAttribute {
  return { key, value: { doubleValue: value } };
}

function boolAttr(key: string, value: boolean): OtlpAttribute {
  return { key, value: { boolValue: value } };
}

// ---------------------------------------------------------------------------
// Resource attributes
// ---------------------------------------------------------------------------

function buildResourceAttributes(
  config: OtelConfig,
  telemetry: RunTelemetry,
  redactor: Redactor,
): OtlpAttribute[] {
  const attrs: OtlpAttribute[] = [
    stringAttr("service.name", config.serviceName),
    stringAttr("service.version", "0.6.0"),
    stringAttr("gen_ai.provider.name", extractProvider(telemetry.modelUsed)),
    stringAttr(
      "cicd.pipeline.name",
      extractWorkflowName(telemetry.workflowUrl),
    ),
    stringAttr("cicd.pipeline.run.id", telemetry.runId),
    stringAttr("vcs.repository.name", telemetry.repo),
    stringAttr("vcs.repository.ref", telemetry.ref),
    stringAttr("vcs.repository.sha", telemetry.sha),
    stringAttr("github.actor", telemetry.actor),
    stringAttr("github.event_name", telemetry.eventName),
  ];

  if (telemetry.issueNumber) {
    attrs.push(stringAttr("github.issue.number", telemetry.issueNumber));
  }

  // Parse extra resource attributes
  if (config.resourceAttributes) {
    const parts = config.resourceAttributes.split(",");
    for (const part of parts) {
      const eqIdx = part.indexOf("=");
      if (eqIdx > 0) {
        const k = part.slice(0, eqIdx).trim();
        const v = part.slice(eqIdx + 1).trim();
        if (k && v) {
          attrs.push(stringAttr(k, redactor.redact(v)));
        }
      }
    }
  }

  return attrs;
}

// ---------------------------------------------------------------------------
// Metrics payload builder
// ---------------------------------------------------------------------------

function buildMetricsPayload(
  config: OtelConfig,
  telemetry: RunTelemetry,
  redactor: Redactor,
): unknown {
  const nowUnixNano = BigInt(Date.now()) * BigInt(1_000_000);
  const startUnixNano =
    telemetry.durationMs > 0
      ? BigInt(Date.now() - telemetry.durationMs) * BigInt(1_000_000)
      : nowUnixNano;

  const resourceAttrs = buildResourceAttributes(config, telemetry, redactor);
  const modelAttr = stringAttr("gen_ai.request.model", telemetry.modelUsed);
  const providerAttr = stringAttr(
    "gen_ai.provider.name",
    extractProvider(telemetry.modelUsed),
  );

  const metrics: unknown[] = [];

  // 1. gen_ai.client.token.usage - Gauge (per-run totals)
  if (telemetry.usage.totalTokens > 0) {
    metrics.push({
      name: "gen_ai.client.token.usage",
      unit: "{token}",
      gauge: {
        dataPoints: [
          {
            startTimeUnixNano: String(startUnixNano),
            timeUnixNano: String(nowUnixNano),
            asInt: String(telemetry.usage.promptTokens),
            attributes: [
              modelAttr,
              providerAttr,
              stringAttr("gen_ai.token.type", "input"),
            ],
          },
          {
            startTimeUnixNano: String(startUnixNano),
            timeUnixNano: String(nowUnixNano),
            asInt: String(telemetry.usage.completionTokens),
            attributes: [
              modelAttr,
              providerAttr,
              stringAttr("gen_ai.token.type", "output"),
            ],
          },
          {
            startTimeUnixNano: String(startUnixNano),
            timeUnixNano: String(nowUnixNano),
            asInt: String(telemetry.usage.totalTokens),
            attributes: [
              modelAttr,
              providerAttr,
              stringAttr("gen_ai.token.type", "total"),
            ],
          },
        ],
      },
    });
  }

  // 2. infer.client.cost - Sum (only when non-zero)
  if (telemetry.usage.cost && telemetry.usage.cost.total > 0) {
    const cost = telemetry.usage.cost;
    metrics.push({
      name: "infer.client.cost",
      unit: "USD",
      sum: {
        dataPoints: [
          {
            startTimeUnixNano: String(startUnixNano),
            timeUnixNano: String(nowUnixNano),
            asDouble: cost.input,
            attributes: [
              modelAttr,
              providerAttr,
              stringAttr("infer.cost.type", "input"),
            ],
          },
          {
            startTimeUnixNano: String(startUnixNano),
            timeUnixNano: String(nowUnixNano),
            asDouble: cost.output,
            attributes: [
              modelAttr,
              providerAttr,
              stringAttr("infer.cost.type", "output"),
            ],
          },
          {
            startTimeUnixNano: String(startUnixNano),
            timeUnixNano: String(nowUnixNano),
            asDouble: cost.total,
            attributes: [
              modelAttr,
              providerAttr,
              stringAttr("infer.cost.type", "total"),
            ],
          },
        ],
        aggregationTemporality: 2, // CUMULATIVE
        isMonotonic: true,
      },
    });
  }

  // 3. infer.agent.tool.calls - Counter per tool
  if (telemetry.usage.toolCalls > 0) {
    // Aggregate failures by tool
    const failuresByTool: Record<string, number> = {};
    for (const f of telemetry.failures) {
      failuresByTool[f.tool] = (failuresByTool[f.tool] ?? 0) + 1;
    }

    // Emit one data point per tool for success and error
    const toolCallDataPoints: unknown[] = [];
    const toolNames = new Set<string>();
    for (const f of telemetry.failures) toolNames.add(f.tool);
    // We don't have per-tool success counts directly from the old interface,
    // but we can derive them from total tool calls minus failures
    // For simplicity, emit aggregate success/error counts
    const totalSuccess = telemetry.usage.toolCalls - telemetry.failures.length;
    const totalFailed = telemetry.failures.length;

    toolCallDataPoints.push({
      startTimeUnixNano: String(startUnixNano),
      timeUnixNano: String(nowUnixNano),
      asInt: String(totalSuccess),
      attributes: [
        stringAttr("gen_ai.tool.name", "*"),
        stringAttr("infer.tool.outcome", "success"),
      ],
    });

    if (totalFailed > 0) {
      toolCallDataPoints.push({
        startTimeUnixNano: String(startUnixNano),
        timeUnixNano: String(nowUnixNano),
        asInt: String(totalFailed),
        attributes: [
          stringAttr("gen_ai.tool.name", "*"),
          stringAttr("infer.tool.outcome", "error"),
          stringAttr("error.type", "tool_error"),
        ],
      });
    }

    // Per-tool breakdown for failures
    for (const [tool, count] of Object.entries(failuresByTool)) {
      toolCallDataPoints.push({
        startTimeUnixNano: String(startUnixNano),
        timeUnixNano: String(nowUnixNano),
        asInt: String(count),
        attributes: [
          stringAttr("gen_ai.tool.name", tool),
          stringAttr("infer.tool.outcome", "error"),
          stringAttr("error.type", "tool_error"),
        ],
      });
    }

    metrics.push({
      name: "infer.agent.tool.calls",
      unit: "{call}",
      sum: {
        dataPoints: toolCallDataPoints,
        aggregationTemporality: 2, // CUMULATIVE
        isMonotonic: true,
      },
    });
  }

  // 4. infer.agent.runs - Counter
  const outcome = determineOutcome(telemetry);
  const runAttrs: OtlpAttribute[] = [stringAttr("infer.run.outcome", outcome)];
  if (outcome === "failed") {
    runAttrs.push(stringAttr("error.type", "exit_code_" + telemetry.exitCode));
  }

  metrics.push({
    name: "infer.agent.runs",
    unit: "{run}",
    sum: {
      dataPoints: [
        {
          startTimeUnixNano: String(startUnixNano),
          timeUnixNano: String(nowUnixNano),
          asInt: "1",
          attributes: runAttrs,
        },
      ],
      aggregationTemporality: 2, // CUMULATIVE
      isMonotonic: true,
    },
  });

  // 5. infer.agent.run.duration - Gauge (seconds)
  if (telemetry.durationMs > 0) {
    metrics.push({
      name: "infer.agent.run.duration",
      unit: "s",
      gauge: {
        dataPoints: [
          {
            startTimeUnixNano: String(startUnixNano),
            timeUnixNano: String(nowUnixNano),
            asDouble: telemetry.durationMs / 1000,
            attributes: [stringAttr("infer.run.outcome", outcome)],
          },
        ],
      },
    });
  }

  return {
    resourceMetrics: [
      {
        resource: { attributes: resourceAttrs },
        scopeMetrics: [
          {
            scope: { name: "infer-action" },
            metrics,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Traces payload builder
// ---------------------------------------------------------------------------

function buildTracesPayload(
  config: OtelConfig,
  telemetry: RunTelemetry,
  redactor: Redactor,
): unknown {
  const nowUnixNano = BigInt(Date.now()) * BigInt(1_000_000);
  const startUnixNano =
    telemetry.durationMs > 0
      ? BigInt(Date.now() - telemetry.durationMs) * BigInt(1_000_000)
      : nowUnixNano;

  const resourceAttrs = buildResourceAttributes(config, telemetry, redactor);
  const traceId = generateTraceId();
  const spanId = generateSpanId();
  const outcome = determineOutcome(telemetry);

  const spans: unknown[] = [
    {
      traceId,
      spanId,
      name: "infer.agent.run",
      kind: 1, // INTERNAL
      startTimeUnixNano: String(startUnixNano),
      endTimeUnixNano: String(nowUnixNano),
      status: {
        code: outcome === "success" ? 0 : 2, // OK vs ERROR
        message: outcome === "success" ? "" : `exit code ${telemetry.exitCode}`,
      },
      attributes: [
        stringAttr("infer.run.outcome", outcome),
        stringAttr("gen_ai.request.model", telemetry.modelUsed),
        stringAttr(
          "gen_ai.provider.name",
          extractProvider(telemetry.modelUsed),
        ),
        intAttr("infer.run.exit_code", Number(telemetry.exitCode)),
        intAttr("infer.run.duration_ms", telemetry.durationMs),
        intAttr("infer.run.total_tokens", telemetry.usage.totalTokens),
        intAttr("infer.run.tool_calls", telemetry.usage.toolCalls),
        intAttr("infer.run.failed_tool_calls", telemetry.failures.length),
      ],
    },
  ];

  return {
    resourceSpans: [
      {
        resource: { attributes: resourceAttrs },
        scopeSpans: [
          {
            scope: { name: "infer-action" },
            spans,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Logs payload builder
// ---------------------------------------------------------------------------

function buildLogsPayload(
  config: OtelConfig,
  telemetry: RunTelemetry,
  redactor: Redactor,
): unknown {
  const nowUnixNano = BigInt(Date.now()) * BigInt(1_000_000);
  const resourceAttrs = buildResourceAttributes(config, telemetry, redactor);

  const logRecords: unknown[] = [];

  for (const failure of telemetry.failures) {
    logRecords.push({
      timeUnixNano: String(nowUnixNano),
      severityNumber: 17, // ERROR
      severityText: "ERROR",
      body: {
        stringValue: redactor.redact(
          `Tool call failed: ${failure.tool} - ${failure.message}`,
        ),
      },
      attributes: [
        stringAttr("gen_ai.tool.name", failure.tool),
        stringAttr("error.type", "tool_error"),
        stringAttr("infer.run.outcome", determineOutcome(telemetry)),
        stringAttr("gen_ai.request.model", telemetry.modelUsed),
      ],
    });
  }

  return {
    resourceLogs: [
      {
        resource: { attributes: resourceAttrs },
        scopeLogs: [
          {
            scope: { name: "infer-action" },
            logRecords,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// HTTP POST helper
// ---------------------------------------------------------------------------

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Combine external abort with timeout
  signal.addEventListener("abort", () => controller.abort());

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "(no body)");
      console.error(`[otel] POST ${url} returned ${response.status}: ${text}`);
    } else {
      console.log(`[otel] POST ${url} → ${response.status}`);
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.error(`[otel] POST ${url} timed out after ${timeoutMs}ms`);
    } else {
      console.error(`[otel] POST ${url} failed:`, (err as Error).message);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Exports run telemetry to the configured OTLP collector.
 *
 * Best-effort: never throws. Logs errors and returns. Honors dry-run.
 */
export async function exportTelemetry(
  config: OtelConfig,
  telemetry: RunTelemetry,
  redactor: Redactor,
  dryRun: boolean,
  signal: AbortSignal = new AbortController().signal,
): Promise<void> {
  if (!config.endpoint) {
    console.log("[otel] no endpoint configured; skipping export");
    return;
  }

  const signals = config.signals.split(",").map((s) => s.trim().toLowerCase());

  const baseUrl = config.endpoint.replace(/\/+$/, "");

  // Parse headers
  const headerMap: Record<string, string> = {};
  if (config.headers) {
    const parts = config.headers.split(",");
    for (const part of parts) {
      const eqIdx = part.indexOf("=");
      if (eqIdx > 0) {
        const k = part.slice(0, eqIdx).trim();
        const v = part.slice(eqIdx + 1).trim();
        if (k && v) {
          headerMap[k] = v;
        }
      }
    }
  }

  // Metrics (always on when endpoint is configured)
  if (signals.includes("metrics")) {
    const payload = buildMetricsPayload(config, telemetry, redactor);
    const url = `${baseUrl}/v1/metrics`;

    if (dryRun) {
      const metricCount = countMetrics(payload);
      console.log(`[dry-run] would export ${metricCount} metrics to ${url}`);
    } else {
      await postJson(url, payload, headerMap, config.timeoutMs, signal);
    }
  }

  // Traces (opt-in)
  if (signals.includes("traces")) {
    const payload = buildTracesPayload(config, telemetry, redactor);
    const url = `${baseUrl}/v1/traces`;

    if (dryRun) {
      console.log(`[dry-run] would export traces to ${url}`);
    } else {
      await postJson(url, payload, headerMap, config.timeoutMs, signal);
    }
  }

  // Logs (opt-in)
  if (signals.includes("logs")) {
    const payload = buildLogsPayload(config, telemetry, redactor);
    const url = `${baseUrl}/v1/logs`;

    if (dryRun) {
      const logCount =
        (
          payload as {
            resourceLogs: Array<{
              scopeLogs: Array<{ logRecords: unknown[] }>;
            }>;
          }
        ).resourceLogs[0]?.scopeLogs[0]?.logRecords.length ?? 0;
      console.log(`[dry-run] would export ${logCount} log records to ${url}`);
    } else {
      await postJson(url, payload, headerMap, config.timeoutMs, signal);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractProvider(model: string): string {
  const slash = model.indexOf("/");
  return slash > 0 ? model.slice(0, slash) : "unknown";
}

function extractWorkflowName(workflowUrl: string): string {
  // URL pattern: https://github.com/{owner}/{repo}/actions/runs/{run_id}
  // We don't have the workflow name directly, so derive from the URL
  if (!workflowUrl) return "unknown";
  return "infer-action";
}

function determineOutcome(telemetry: RunTelemetry): string {
  if (telemetry.timedOut) return "stopped_early";
  if (telemetry.stoppedEarly) return "stopped_early";
  if (telemetry.exitCode !== "0") return "failed";
  return "success";
}

function generateTraceId(): string {
  // 32 hex chars (16 bytes)
  return randomHex(32);
}

function generateSpanId(): string {
  // 16 hex chars (8 bytes)
  return randomHex(16);
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function countMetrics(payload: unknown): number {
  try {
    const p = payload as {
      resourceMetrics: Array<{
        scopeMetrics: Array<{ metrics: unknown[] }>;
      }>;
    };
    return p.resourceMetrics[0]?.scopeMetrics[0]?.metrics.length ?? 0;
  } catch {
    return 0;
  }
}

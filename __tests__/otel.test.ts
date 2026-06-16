import { describe, expect, it, spyOn } from "bun:test";
import {
  loadOtelConfig,
  exportTelemetry,
  buildMetricsPayload,
  buildTracesPayload,
  buildLogsPayload,
  type OtelConfig,
  type RunTelemetry,
} from "../src/otel.js";
import { createRedactor } from "../src/redact.js";
import { INFER_VERSION } from "../src/version.js";

function makeTelemetry(overrides: Partial<RunTelemetry> = {}): RunTelemetry {
  return {
    usage: {
      promptTokens: 1000,
      completionTokens: 200,
      totalTokens: 1200,
      requests: 2,
      toolCalls: 5,
      cost: { input: 0.003, output: 0.003, total: 0.006, currency: "USD" },
    },
    failures: [
      { tool: "WebFetch", message: "blocked URL" },
      { tool: "Bash", message: "command not found" },
    ],
    toolCallCounts: {
      total: 5,
      failed: 2,
      perToolSuccess: { WebFetch: 0, Bash: 0, TodoWrite: 3 },
      perToolError: { WebFetch: 1, Bash: 1 },
    },
    exitCode: "0",
    modelUsed: "anthropic/claude-sonnet-4",
    durationMs: 45000,
    stoppedEarly: false,
    timedOut: false,
    actor: "test-user",
    repo: "owner/repo",
    workflowUrl: "https://github.com/owner/repo/actions/runs/123",
    runId: "123",
    sha: "abc123",
    ref: "refs/heads/main",
    eventName: "issue_comment",
    issueNumber: "42",
    prUrl: "",
    ...overrides,
  };
}

function makeConfig(overrides: Partial<OtelConfig> = {}): OtelConfig {
  return {
    endpoint: "",
    headers: "",
    protocol: "http/json",
    serviceName: "infer-action",
    resourceAttributes: "",
    signals: "metrics",
    timeoutMs: 5000,
    ...overrides,
  };
}

describe("loadOtelConfig", () => {
  it("loads from env vars with defaults", () => {
    const config = loadOtelConfig({});
    expect(config.endpoint).toBe("");
    expect(config.serviceName).toBe("infer-action");
    expect(config.signals).toBe("metrics");
    expect(config.timeoutMs).toBe(5000);
  });

  it("reads values from env vars", () => {
    const config = loadOtelConfig({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
      OTEL_SERVICE_NAME: "my-service",
      OTEL_SIGNALS: "metrics,traces",
      OTEL_EXPORT_TIMEOUT_MS: "10000",
      OTEL_RESOURCE_ATTRIBUTES: "env=prod,team=platform",
    });
    expect(config.endpoint).toBe("http://localhost:4318");
    expect(config.serviceName).toBe("my-service");
    expect(config.signals).toBe("metrics,traces");
    expect(config.timeoutMs).toBe(10000);
    expect(config.resourceAttributes).toBe("env=prod,team=platform");
  });
});

describe("exportTelemetry", () => {
  it("skips export when endpoint is empty", async () => {
    const config = makeConfig({ endpoint: "" });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await exportTelemetry(config, telemetry, redactor, false);

    expect(logSpy).toHaveBeenCalledWith(
      "[otel] no endpoint configured; skipping export",
    );
    logSpy.mockRestore();
  });

  it("logs dry-run metrics count when dryRun is true", async () => {
    const config = makeConfig({
      endpoint: "http://localhost:4318",
      signals: "metrics",
    });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await exportTelemetry(config, telemetry, redactor, true);

    // Should log dry-run message with metric count
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run] would export"),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("/v1/metrics"));
    logSpy.mockRestore();
  });

  it("logs dry-run for traces when signals include traces", async () => {
    const config = makeConfig({
      endpoint: "http://localhost:4318",
      signals: "metrics,traces",
    });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await exportTelemetry(config, telemetry, redactor, true);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run] would export"),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("/v1/traces"));
    logSpy.mockRestore();
  });

  it("logs dry-run for logs when signals include logs", async () => {
    const config = makeConfig({
      endpoint: "http://localhost:4318",
      signals: "metrics,logs",
    });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await exportTelemetry(config, telemetry, redactor, true);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run] would export"),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("/v1/logs"));
    logSpy.mockRestore();
  });

  it("handles failed run telemetry", async () => {
    const config = makeConfig({
      endpoint: "http://localhost:4318",
      signals: "metrics",
    });
    const telemetry = makeTelemetry({
      exitCode: "1",
      stoppedEarly: false,
      timedOut: false,
    });
    const redactor = createRedactor();
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await exportTelemetry(config, telemetry, redactor, true);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run] would export"),
    );
    logSpy.mockRestore();
  });

  it("handles stopped-early telemetry", async () => {
    const config = makeConfig({
      endpoint: "http://localhost:4318",
      signals: "metrics",
    });
    const telemetry = makeTelemetry({
      exitCode: "0",
      stoppedEarly: true,
      timedOut: false,
    });
    const redactor = createRedactor();
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await exportTelemetry(config, telemetry, redactor, true);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run] would export"),
    );
    logSpy.mockRestore();
  });

  it("handles timed-out telemetry", async () => {
    const config = makeConfig({
      endpoint: "http://localhost:4318",
      signals: "metrics",
    });
    const telemetry = makeTelemetry({
      exitCode: "0",
      stoppedEarly: false,
      timedOut: true,
    });
    const redactor = createRedactor();
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await exportTelemetry(config, telemetry, redactor, true);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run] would export"),
    );
    logSpy.mockRestore();
  });

  it("handles zero-token usage (no cost)", async () => {
    const config = makeConfig({
      endpoint: "http://localhost:4318",
      signals: "metrics",
    });
    const telemetry = makeTelemetry({
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        requests: 0,
        toolCalls: 0,
      },
    });
    const redactor = createRedactor();
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await exportTelemetry(config, telemetry, redactor, true);

    // Should still export at least the run counter metric
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run] would export"),
    );
    logSpy.mockRestore();
  });

  it("redacts secret values in resource attributes", async () => {
    const config = makeConfig({
      endpoint: "http://localhost:4318",
      resourceAttributes: "token=sk-my-secret-key",
      signals: "metrics",
    });
    const telemetry = makeTelemetry();
    const redactor = createRedactor({
      env: { OPENAI_API_KEY: "sk-my-secret-key" },
    });
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await exportTelemetry(config, telemetry, redactor, true);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run] would export"),
    );
    logSpy.mockRestore();
  });

  it("handles empty failures array", async () => {
    const config = makeConfig({
      endpoint: "http://localhost:4318",
      signals: "metrics,logs",
    });
    const telemetry = makeTelemetry({ failures: [] });
    const redactor = createRedactor();
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await exportTelemetry(config, telemetry, redactor, true);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run] would export"),
    );
    logSpy.mockRestore();
  });

  it("handles missing model provider gracefully", async () => {
    const config = makeConfig({
      endpoint: "http://localhost:4318",
      signals: "metrics",
    });
    const telemetry = makeTelemetry({ modelUsed: "unknown-model" });
    const redactor = createRedactor();
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    await exportTelemetry(config, telemetry, redactor, true);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run] would export"),
    );
    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Typed OTLP payload shapes, so the payload assertions stay free of `any`.
// ---------------------------------------------------------------------------

interface OtlpValue {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
}

interface OtlpAttr {
  key: string;
  value: OtlpValue;
}

interface OtlpDataPoint {
  asInt?: string;
  asDouble?: number;
  attributes: OtlpAttr[];
}

interface OtlpMetric {
  name: string;
  unit?: string;
  gauge?: { dataPoints: OtlpDataPoint[] };
  sum?: { dataPoints: OtlpDataPoint[] };
}

interface MetricsPayload {
  resourceMetrics: Array<{
    resource: { attributes: OtlpAttr[] };
    scopeMetrics: Array<{ metrics: OtlpMetric[] }>;
  }>;
}

interface OtlpSpan {
  name: string;
  kind: number;
  status: { code: number; message: string };
  attributes: OtlpAttr[];
}

interface TracesPayload {
  resourceSpans: Array<{
    resource: { attributes: OtlpAttr[] };
    scopeSpans: Array<{ spans: OtlpSpan[] }>;
  }>;
}

interface OtlpLogRecord {
  severityNumber: number;
  severityText: string;
  body: { stringValue: string };
  attributes: OtlpAttr[];
}

interface LogsPayload {
  resourceLogs: Array<{
    resource: { attributes: OtlpAttr[] };
    scopeLogs: Array<{ logRecords: OtlpLogRecord[] }>;
  }>;
}

function findAttr(attrs: OtlpAttr[], key: string): OtlpAttr | undefined {
  return attrs.find((a) => a.key === key);
}

function attrStr(attrs: OtlpAttr[], key: string): string | undefined {
  return findAttr(attrs, key)?.value.stringValue;
}

function hasAttr(attrs: OtlpAttr[], key: string, value: string): boolean {
  return attrs.some((a) => a.key === key && a.value.stringValue === value);
}

function pointBy(
  points: OtlpDataPoint[],
  key: string,
  value: string,
): OtlpDataPoint | undefined {
  return points.find((dp) => hasAttr(dp.attributes, key, value));
}

function metricsOf(payload: unknown): OtlpMetric[] {
  const p = payload as MetricsPayload;
  return p.resourceMetrics[0].scopeMetrics[0].metrics;
}

function resAttrsOf(payload: unknown): OtlpAttr[] {
  const p = payload as MetricsPayload;
  return p.resourceMetrics[0].resource.attributes;
}

function metricByName(payload: unknown, name: string): OtlpMetric | undefined {
  return metricsOf(payload).find((m) => m.name === name);
}

function pointKey(dp: OtlpDataPoint): string {
  const tool = attrStr(dp.attributes, "gen_ai.tool.name");
  const outcome = attrStr(dp.attributes, "infer.tool.outcome");
  return `${tool}/${outcome}`;
}

function pointMap(points: OtlpDataPoint[]): Map<string, OtlpDataPoint> {
  const map = new Map<string, OtlpDataPoint>();
  for (const dp of points) map.set(pointKey(dp), dp);
  return map;
}

describe("buildMetricsPayload", () => {
  it("emits token usage with input and output datapoints only", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const payload = buildMetricsPayload(config, telemetry, redactor);

    const metric = metricByName(payload, "gen_ai.client.token.usage");
    expect(metric).toBeDefined();
    const points = metric!.gauge!.dataPoints;
    expect(points).toHaveLength(2);

    const input = pointBy(points, "gen_ai.token.type", "input");
    const output = pointBy(points, "gen_ai.token.type", "output");
    const total = pointBy(points, "gen_ai.token.type", "total");
    expect(input?.asInt).toBe("1000");
    expect(output?.asInt).toBe("200");
    expect(total).toBeUndefined();
  });

  it("emits cost with input and output datapoints only", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const payload = buildMetricsPayload(config, telemetry, redactor);

    const metric = metricByName(payload, "infer.client.cost");
    expect(metric).toBeDefined();
    const points = metric!.sum!.dataPoints;
    expect(points).toHaveLength(2);

    const key = "infer.cost.type";
    const types = points.map((dp) => attrStr(dp.attributes, key));
    expect(types).toEqual(["input", "output"]);
    expect(types).not.toContain("total");
  });

  it("emits per-tool success and error call counts", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const payload = buildMetricsPayload(config, telemetry, redactor);

    const metric = metricByName(payload, "infer.agent.tool.calls");
    expect(metric).toBeDefined();
    const points = metric!.sum!.dataPoints;
    // TodoWrite: 3 success; WebFetch: 1 error; Bash: 1 error -> 3 points
    expect(points).toHaveLength(3);

    const byKey = pointMap(points);
    expect(byKey.get("TodoWrite/success")?.asInt).toBe("3");
    expect(byKey.get("WebFetch/error")?.asInt).toBe("1");
    expect(byKey.get("Bash/error")?.asInt).toBe("1");
  });

  it("emits a run counter with the outcome attribute", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const payload = buildMetricsPayload(config, telemetry, redactor);

    const metric = metricByName(payload, "infer.agent.runs");
    expect(metric).toBeDefined();
    const points = metric!.sum!.dataPoints;
    expect(points).toHaveLength(1);

    const dp = points[0]!;
    expect(dp.asInt).toBe("1");
    expect(hasAttr(dp.attributes, "infer.run.outcome", "success")).toBe(true);
  });

  it("emits a run-duration gauge in seconds", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const payload = buildMetricsPayload(config, telemetry, redactor);

    const metric = metricByName(payload, "infer.agent.run.duration");
    expect(metric).toBeDefined();
    expect(metric!.gauge!.dataPoints[0]?.asDouble).toBe(45);
  });

  it("redacts secret values in resource attributes", () => {
    const config = makeConfig({
      endpoint: "http://localhost:4318",
      resourceAttributes: "token=sk-my-secret-key",
    });
    const telemetry = makeTelemetry();
    const redactor = createRedactor({
      env: { OPENAI_API_KEY: "sk-my-secret-key" },
    });
    const payload = buildMetricsPayload(config, telemetry, redactor);

    expect(attrStr(resAttrsOf(payload), "token")).toBe("***");
  });

  it("includes service.name and service.version resource attrs", () => {
    const config = makeConfig({
      endpoint: "http://localhost:4318",
      serviceName: "my-custom-service",
    });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();

    const origRef = process.env["GITHUB_ACTION_REF"];
    process.env["GITHUB_ACTION_REF"] = "v0.15.0";
    try {
      const payload = buildMetricsPayload(config, telemetry, redactor);
      const attrs = resAttrsOf(payload);
      expect(attrStr(attrs, "service.name")).toBe("my-custom-service");
      expect(attrStr(attrs, "service.version")).toBe("v0.15.0");
    } finally {
      if (origRef === undefined) {
        delete process.env["GITHUB_ACTION_REF"];
      } else {
        process.env["GITHUB_ACTION_REF"] = origRef;
      }
    }
  });

  it("falls back to INFER_VERSION when GITHUB_ACTION_REF is unset", () => {
    const config = makeConfig({
      endpoint: "http://localhost:4318",
    });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();

    const origRef = process.env["GITHUB_ACTION_REF"];
    delete process.env["GITHUB_ACTION_REF"];
    try {
      const payload = buildMetricsPayload(config, telemetry, redactor);
      const attrs = resAttrsOf(payload);
      expect(attrStr(attrs, "service.version")).toBe(INFER_VERSION);
    } finally {
      if (origRef !== undefined) {
        process.env["GITHUB_ACTION_REF"] = origRef;
      }
    }
  });
});

describe("buildTracesPayload", () => {
  function spanOf(payload: unknown): OtlpSpan {
    const p = payload as TracesPayload;
    return p.resourceSpans[0].scopeSpans[0].spans[0]!;
  }

  it("emits a root span with the run attributes", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const payload = buildTracesPayload(config, telemetry, redactor);

    const span = spanOf(payload);
    expect(span.name).toBe("infer.agent.run");
    expect(span.kind).toBe(1);
    expect(span.status.code).toBe(0);

    const a = span.attributes;
    const model = "anthropic/claude-sonnet-4";
    expect(hasAttr(a, "infer.run.outcome", "success")).toBe(true);
    expect(hasAttr(a, "gen_ai.request.model", model)).toBe(true);
    const dur = findAttr(a, "infer.run.duration_ms");
    expect(dur?.value.intValue).toBe("45000");
  });

  it("marks failed runs with ERROR status", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry({ exitCode: "1" });
    const redactor = createRedactor();
    const payload = buildTracesPayload(config, telemetry, redactor);

    const span = spanOf(payload);
    expect(span.status.code).toBe(2);
    expect(span.status.message).toContain("exit code 1");
  });
});

describe("buildLogsPayload", () => {
  function recordsOf(payload: unknown): OtlpLogRecord[] {
    const p = payload as LogsPayload;
    return p.resourceLogs[0].scopeLogs[0].logRecords;
  }

  it("emits one ERROR record per failure", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const payload = buildLogsPayload(config, telemetry, redactor);

    const records = recordsOf(payload);
    expect(records).toHaveLength(2);
    expect(records[0]?.severityNumber).toBe(17);
    expect(records[0]?.severityText).toBe("ERROR");
    expect(records[0]?.body.stringValue).toContain("WebFetch");
    expect(records[0]?.body.stringValue).toContain("blocked URL");
    expect(records[1]?.body.stringValue).toContain("Bash");
    expect(records[1]?.body.stringValue).toContain("command not found");
  });

  it("emits an empty record list when there are no failures", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry({ failures: [] });
    const redactor = createRedactor();
    const payload = buildLogsPayload(config, telemetry, redactor);

    expect(recordsOf(payload)).toHaveLength(0);
  });
});

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

describe("buildMetricsPayload", () => {
  it("includes gen_ai.client.token.usage with input and output datapoints only (no total)", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const payload = buildMetricsPayload(config, telemetry, redactor) as {
      resourceMetrics: Array<{
        resource: { attributes: Array<{ key: string }> };
        scopeMetrics: Array<{ metrics: Array<{ name: string; gauge?: { dataPoints: Array<{ asInt: string; attributes: Array<{ key: string; value: { stringValue?: string } }> }> }; sum?: { dataPoints: Array<{ asInt?: string; asDouble?: number; attributes: Array<{ key: string; value: { stringValue?: string } }> }> } }> }>;
      }>;
    };

    const metrics = payload.resourceMetrics[0].scopeMetrics[0].metrics;
    const tokenMetric = metrics.find((m) => m.name === "gen_ai.client.token.usage") as {
      gauge: { dataPoints: Array<{ asInt: string; attributes: Array<{ key: string; value: { stringValue?: string } }> }> };
    };

    expect(tokenMetric).toBeDefined();
    expect(tokenMetric.gauge.dataPoints).toHaveLength(2);

    const inputDp = tokenMetric.gauge.dataPoints.find((dp) =>
      dp.attributes.some((a) => a.key === "gen_ai.token.type" && a.value.stringValue === "input"),
    );
    const outputDp = tokenMetric.gauge.dataPoints.find((dp) =>
      dp.attributes.some((a) => a.key === "gen_ai.token.type" && a.value.stringValue === "output"),
    );
    const totalDp = tokenMetric.gauge.dataPoints.find((dp) =>
      dp.attributes.some((a) => a.key === "gen_ai.token.type" && a.value.stringValue === "total"),
    );

    expect(inputDp).toBeDefined();
    expect(inputDp!.asInt).toBe("1000");
    expect(outputDp).toBeDefined();
    expect(outputDp!.asInt).toBe("200");
    expect(totalDp).toBeUndefined();
  });

  it("includes infer.client.cost with input and output datapoints only (no total)", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const payload = buildMetricsPayload(config, telemetry, redactor) as any;

    const metrics = payload.resourceMetrics[0].scopeMetrics[0].metrics;
    const costMetric = metrics.find((m: any) => m.name === "infer.client.cost");

    expect(costMetric).toBeDefined();
    expect(costMetric.sum.dataPoints).toHaveLength(2);

    const costTypes = costMetric.sum.dataPoints.map((dp: any) =>
      dp.attributes.find((a: any) => a.key === "infer.cost.type")?.value.stringValue,
    );
    expect(costTypes).toEqual(["input", "output"]);
    expect(costTypes).not.toContain("total");
  });

  it("includes infer.agent.tool.calls with per-tool success/error datapoints", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const payload = buildMetricsPayload(config, telemetry, redactor) as any;

    const metrics = payload.resourceMetrics[0].scopeMetrics[0].metrics;
    const toolMetric = metrics.find((m: any) => m.name === "infer.agent.tool.calls");

    expect(toolMetric).toBeDefined();
    // WebFetch: 0 success, 1 error; Bash: 0 success, 1 error; TodoWrite: 3 success, 0 error
    // So we should have: TodoWrite/success, WebFetch/error, Bash/error = 3 datapoints
    expect(toolMetric.sum.dataPoints).toHaveLength(3);

    const todoWriteSuccess = toolMetric.sum.dataPoints.find(
      (dp: any) =>
        dp.attributes.some((a: any) => a.key === "gen_ai.tool.name" && a.value.stringValue === "TodoWrite") &&
        dp.attributes.some((a: any) => a.key === "infer.tool.outcome" && a.value.stringValue === "success"),
    );
    expect(todoWriteSuccess).toBeDefined();
    expect(todoWriteSuccess.asInt).toBe("3");

    const webFetchError = toolMetric.sum.dataPoints.find(
      (dp: any) =>
        dp.attributes.some((a: any) => a.key === "gen_ai.tool.name" && a.value.stringValue === "WebFetch") &&
        dp.attributes.some((a: any) => a.key === "infer.tool.outcome" && a.value.stringValue === "error"),
    );
    expect(webFetchError).toBeDefined();
    expect(webFetchError.asInt).toBe("1");
  });

  it("includes infer.agent.runs counter with outcome attribute", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const payload = buildMetricsPayload(config, telemetry, redactor) as any;

    const metrics = payload.resourceMetrics[0].scopeMetrics[0].metrics;
    const runMetric = metrics.find((m: any) => m.name === "infer.agent.runs");

    expect(runMetric).toBeDefined();
    expect(runMetric.sum.dataPoints).toHaveLength(1);
    expect(runMetric.sum.dataPoints[0].asInt).toBe("1");
    expect(
      runMetric.sum.dataPoints[0].attributes.some(
        (a: any) => a.key === "infer.run.outcome" && a.value.stringValue === "success",
      ),
    ).toBe(true);
  });

  it("includes infer.agent.run.duration gauge when durationMs > 0", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const payload = buildMetricsPayload(config, telemetry, redactor) as any;

    const metrics = payload.resourceMetrics[0].scopeMetrics[0].metrics;
    const durationMetric = metrics.find((m: any) => m.name === "infer.agent.run.duration");

    expect(durationMetric).toBeDefined();
    expect(durationMetric.gauge.dataPoints[0].asDouble).toBe(45); // 45000ms / 1000
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
    const payload = buildMetricsPayload(config, telemetry, redactor) as any;

    const resourceAttrs = payload.resourceMetrics[0].resource.attributes;
    const tokenAttr = resourceAttrs.find((a: any) => a.key === "token");

    expect(tokenAttr).toBeDefined();
    // The secret value should be redacted to "***"
    expect(tokenAttr.value.stringValue).toBe("***");
  });

  it("includes service.name and service.version in resource attributes", () => {
    const config = makeConfig({
      endpoint: "http://localhost:4318",
      serviceName: "my-custom-service",
    });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const payload = buildMetricsPayload(config, telemetry, redactor) as any;

    const resourceAttrs = payload.resourceMetrics[0].resource.attributes;
    const serviceNameAttr = resourceAttrs.find((a: any) => a.key === "service.name");
    const serviceVersionAttr = resourceAttrs.find((a: any) => a.key === "service.version");

    expect(serviceNameAttr).toBeDefined();
    expect(serviceNameAttr.value.stringValue).toBe("my-custom-service");
    expect(serviceVersionAttr).toBeDefined();
    expect(serviceVersionAttr.value.stringValue).toBe("0.6.0");
  });
});

describe("buildTracesPayload", () => {
  it("includes a root span with correct attributes", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const payload = buildTracesPayload(config, telemetry, redactor) as any;

    const spans = payload.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(1);

    const span = spans[0];
    expect(span.name).toBe("infer.agent.run");
    expect(span.kind).toBe(1); // INTERNAL
    expect(span.status.code).toBe(0); // OK

    const spanAttrs = span.attributes;
    expect(spanAttrs.some((a: any) => a.key === "infer.run.outcome" && a.value.stringValue === "success")).toBe(true);
    expect(spanAttrs.some((a: any) => a.key === "gen_ai.request.model" && a.value.stringValue === "anthropic/claude-sonnet-4")).toBe(true);
    expect(spanAttrs.some((a: any) => a.key === "infer.run.duration_ms" && a.value.intValue === "45000")).toBe(true);
  });

  it("sets status code 2 (ERROR) for failed runs", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry({ exitCode: "1" });
    const redactor = createRedactor();
    const payload = buildTracesPayload(config, telemetry, redactor) as any;

    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.status.code).toBe(2); // ERROR
    expect(span.status.message).toContain("exit code 1");
  });
});

describe("buildLogsPayload", () => {
  it("includes one log record per failure", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry();
    const redactor = createRedactor();
    const payload = buildLogsPayload(config, telemetry, redactor) as any;

    const logRecords = payload.resourceLogs[0].scopeLogs[0].logRecords;
    expect(logRecords).toHaveLength(2);

    expect(logRecords[0].severityNumber).toBe(17); // ERROR
    expect(logRecords[0].severityText).toBe("ERROR");
    expect(logRecords[0].body.stringValue).toContain("WebFetch");
    expect(logRecords[0].body.stringValue).toContain("blocked URL");

    expect(logRecords[1].body.stringValue).toContain("Bash");
    expect(logRecords[1].body.stringValue).toContain("command not found");
  });

  it("emits empty logRecords array when there are no failures", () => {
    const config = makeConfig({ endpoint: "http://localhost:4318" });
    const telemetry = makeTelemetry({ failures: [] });
    const redactor = createRedactor();
    const payload = buildLogsPayload(config, telemetry, redactor) as any;

    const logRecords = payload.resourceLogs[0].scopeLogs[0].logRecords;
    expect(logRecords).toHaveLength(0);
  });
});

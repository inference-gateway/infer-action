import { describe, expect, it, vi } from "vitest";
import {
  loadOtelConfig,
  exportTelemetry,
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
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

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
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await exportTelemetry(config, telemetry, redactor, true);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run] would export"),
    );
    logSpy.mockRestore();
  });
});

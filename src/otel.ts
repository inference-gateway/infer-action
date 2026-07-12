/**
 * OpenTelemetry configuration loader.
 *
 * The infer-action no longer ships its own OTLP exporter. The `infer` CLI emits
 * telemetry natively (metrics, traces, logs) from real internal signals, fully
 * configurable via the standard OTel environment variables. This module simply
 * reads those env vars so the action can pass them through to the CLI subprocess
 * via buildChildEnv in runner.ts.
 *
 * Design:
 * - Zero external dependencies.
 * - Best-effort: never fails the run.
 * - Dry-run aware: the CLI handles its own dry-run behavior.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface OtelConfig {
  /** OTLP HTTP endpoint (e.g. http://localhost:4318). Empty = disabled. */
  endpoint: string;
  /** Headers for the OTLP HTTP requests (e.g. "Authorization=Bearer ..."). */
  headers: string;
  /** service.name resource attribute. */
  serviceName: string;
  /** Extra resource attributes (key=val,key2=val2 format). */
  resourceAttributes: string;
}

export function loadOtelConfig(env: NodeJS.ProcessEnv): OtelConfig {
  return {
    endpoint: env["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "",
    headers: env["OTEL_EXPORTER_OTLP_HEADERS"] ?? "",
    serviceName: env["OTEL_SERVICE_NAME"] ?? "infer-action",
    resourceAttributes: env["OTEL_RESOURCE_ATTRIBUTES"] ?? "",
  };
}

import { describe, expect, it } from "bun:test";
import { loadOtelConfig } from "../src/otel.js";

describe("loadOtelConfig", () => {
  it("loads from env vars with defaults", () => {
    const config = loadOtelConfig({});
    expect(config.endpoint).toBe("");
    expect(config.serviceName).toBe("infer-action");
  });

  it("reads values from env vars", () => {
    const config = loadOtelConfig({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
      OTEL_SERVICE_NAME: "my-service",
      OTEL_RESOURCE_ATTRIBUTES: "env=prod,team=platform",
    });
    expect(config.endpoint).toBe("http://localhost:4318");
    expect(config.serviceName).toBe("my-service");
    expect(config.resourceAttributes).toBe("env=prod,team=platform");
  });

  it("defaults headers to empty string", () => {
    const config = loadOtelConfig({});
    expect(config.headers).toBe("");
  });

  it("reads headers from env vars", () => {
    const config = loadOtelConfig({
      OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer my-token",
    });
    expect(config.headers).toBe("Authorization=Bearer my-token");
  });
});

import { describe, expect, it } from "bun:test";
import type { spawnSync } from "node:child_process";
import {
  binaryGatewayVersion,
  cleanGatewayVersion,
  parseImageVersion,
  parseVersionPayload,
  persistGatewayVersion,
  pollGatewayVersion,
  readPersistedGatewayVersion,
  resolveGatewayVersion,
} from "../src/gateway-version.js";

const respond = (body: string, ok = true): typeof fetch =>
  (async () => ({ ok, text: async () => body })) as unknown as typeof fetch;

const failing = (): typeof fetch =>
  (async () => {
    throw new Error("connection refused");
  }) as unknown as typeof fetch;

describe("cleanGatewayVersion", () => {
  it("normalizes a v prefix and accepts plain versions", () => {
    expect(cleanGatewayVersion("v0.50.0")).toBe("0.50.0");
    expect(cleanGatewayVersion("0.50.0")).toBe("0.50.0");
    expect(cleanGatewayVersion("  0.50.0\n")).toBe("0.50.0");
  });

  it("rejects values that are not versions", () => {
    expect(cleanGatewayVersion("latest")).toBe("");
    expect(cleanGatewayVersion("<html>bad</html>")).toBe("");
    expect(cleanGatewayVersion("")).toBe("");
    expect(cleanGatewayVersion(`"0.50.0"`)).toBe("");
  });
});

describe("parseVersionPayload", () => {
  it("reads the version field from the JSON payload", () => {
    expect(parseVersionPayload(`{"version":"v0.50.0"}`)).toBe("0.50.0");
  });

  it("reads a plain-text body", () => {
    expect(parseVersionPayload("0.50.0")).toBe("0.50.0");
  });

  it("rejects JSON without a version and non-version text", () => {
    expect(parseVersionPayload(`{"status":"ok"}`)).toBe("");
    expect(parseVersionPayload("<html>bad</html>")).toBe("");
  });
});

describe("parseImageVersion", () => {
  it("extracts a pinned image tag and rejects floating tags", () => {
    expect(
      parseImageVersion("ghcr.io/inference-gateway/inference-gateway:v0.50.0"),
    ).toBe("0.50.0");
    expect(
      parseImageVersion("ghcr.io/inference-gateway/inference-gateway:latest"),
    ).toBe("");
    expect(parseImageVersion("inference-gateway")).toBe("");
  });
});

describe("pollGatewayVersion", () => {
  it("returns the version once the gateway serves /version", async () => {
    let calls = 0;
    const fetcher = (async () => {
      calls += 1;
      if (calls <= 2) {
        throw new Error("connection refused");
      }
      return {
        ok: true,
        text: async () => `{"version":"v0.50.0"}`,
      } as Response;
    }) as unknown as typeof fetch;
    expect(
      await pollGatewayVersion("http://localhost:9004/", fetcher, 1, 5_000),
    ).toBe("0.50.0");
    expect(calls).toBe(3);
  });

  it("gives up empty at the deadline", async () => {
    expect(
      await pollGatewayVersion("http://localhost:9004", failing(), 1, 1),
    ).toBe("");
  });

  it("ignores a health endpoint that answers without the version", async () => {
    expect(
      await pollGatewayVersion(
        "http://localhost:9004",
        respond(`{"status":"ok"}`),
        1,
        1,
      ),
    ).toBe("");
  });
});

describe("resolveGatewayVersion", () => {
  const config = {
    url: "http://localhost:9004",
    run: true,
    oci: "",
    standaloneBinary: false,
  };

  it("prefers the gateway /version endpoint", async () => {
    const out = await resolveGatewayVersion(
      "infer",
      {},
      {
        readConfig: () => config,
        fetcher: respond(`{"version":"v0.51.2"}`),
        binaryVersion: () => "0.50.0",
      },
    );
    expect(out).toBe("0.51.2");
  });

  it("falls back to the image tag when the endpoint stays down in container mode", async () => {
    const out = await resolveGatewayVersion(
      "infer",
      {},
      {
        readConfig: () => ({
          ...config,
          oci: "ghcr.io/inference-gateway/inference-gateway:v0.50.0",
        }),
        fetcher: failing(),
        deadlineMs: 1,
        binaryVersion: () => "0.49.1",
      },
    );
    expect(out).toBe("0.50.0");
  });

  it("falls back to the cached binary in managed binary mode", async () => {
    const out = await resolveGatewayVersion(
      "infer",
      {},
      {
        readConfig: () => config,
        fetcher: failing(),
        deadlineMs: 1,
        binaryVersion: () => "0.49.1",
      },
    );
    expect(out).toBe("0.49.1");
  });

  it("skips the image tag when the gateway runs as a standalone binary", async () => {
    const out = await resolveGatewayVersion(
      "infer",
      {},
      {
        readConfig: () => ({
          ...config,
          oci: "ghcr.io/inference-gateway/inference-gateway:v0.50.0",
          standaloneBinary: true,
        }),
        fetcher: failing(),
        deadlineMs: 1,
        binaryVersion: () => "0.49.1",
      },
    );
    expect(out).toBe("0.49.1");
  });

  it("reports nothing for an externally managed gateway", async () => {
    const out = await resolveGatewayVersion(
      "infer",
      {},
      {
        readConfig: () => ({ ...config, run: false }),
        fetcher: failing(),
        deadlineMs: 1,
        binaryVersion: () => "0.49.1",
      },
    );
    expect(out).toBe("");
  });

  it("reports nothing without a readable gateway config", async () => {
    const out = await resolveGatewayVersion(
      "infer",
      {},
      {
        readConfig: () => null,
        fetcher: failing(),
        binaryVersion: () => "0.49.1",
      },
    );
    expect(out).toBe("");
  });
});

describe("binaryGatewayVersion", () => {
  it("parses the --version output of the managed binary", () => {
    const exec = (() => ({
      status: 0,
      stdout: "inference-gateway version 0.50.0\n",
    })) as unknown as typeof spawnSync;
    expect(binaryGatewayVersion(exec)).toBe("0.50.0");
  });

  it("yields empty when the binary is unavailable", () => {
    const exec = (() => ({
      status: 1,
      stdout: "",
    })) as unknown as typeof spawnSync;
    expect(binaryGatewayVersion(exec)).toBe("");
  });
});

describe("gateway version handoff", () => {
  it("persists the version for the report process and reads it back", () => {
    persistGatewayVersion("0.51.2");
    expect(readPersistedGatewayVersion()).toBe("0.51.2");
  });
});

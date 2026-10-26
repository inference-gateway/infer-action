import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { GATEWAY_VERSION_PATH } from "./prelude.js";

export interface GatewayConfig {
  url: string;
  run: boolean;
  oci: string;
  standaloneBinary: boolean;
}

const PROBE_INTERVAL_MS = 3_000;
const PROBE_DEADLINE_MS = 5 * 60_000;
const PROBE_TIMEOUT_MS = 2_000;

export interface ResolveOpts {
  readConfig?: () => GatewayConfig | null;
  fetcher?: typeof fetch;
  intervalMs?: number;
  deadlineMs?: number;
  binaryVersion?: () => string;
}

/**
 * Resolves the gateway version the same way the CLI's gateway supervisor does:
 * first probe the gateway's /version endpoint (it only starts with the agent, so
 * poll until the deadline), then the managed sources - the container image tag
 * or the cached binary's --version. Empty when nothing can be determined.
 */
export async function resolveGatewayVersion(
  inferBin: string,
  env: NodeJS.ProcessEnv,
  opts: ResolveOpts = {},
): Promise<string> {
  const cfg = opts.readConfig
    ? opts.readConfig()
    : readGatewayConfig(inferBin, env);
  if (!cfg) return "";
  const version = await pollGatewayVersion(
    cfg.url,
    opts.fetcher ?? fetch,
    opts.intervalMs,
    opts.deadlineMs,
  );
  if (version) return version;
  if (!cfg.run) return "";
  if (cfg.oci && !cfg.standaloneBinary) return parseImageVersion(cfg.oci);
  return opts.binaryVersion ? opts.binaryVersion() : binaryGatewayVersion();
}

/** Renders a cleaned version the way the identity line shows it (0.50.0 -> v0.50.0). */
export function gatewayVersionLabel(version: string): string {
  return version ? `v${version}` : "";
}

/** Polls GET {url}/version - the endpoint the CLI's own supervisor probes - until the gateway serves it or the deadline passes. */
export async function pollGatewayVersion(
  url: string,
  fetcher: typeof fetch = fetch,
  intervalMs = PROBE_INTERVAL_MS,
  deadlineMs = PROBE_DEADLINE_MS,
): Promise<string> {
  const versionUrl = `${url.replace(/\/+$/, "")}/version`;
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    try {
      const res = await fetcher(versionUrl, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (res.ok) {
        const version = parseVersionPayload(await res.text());
        if (version) return version;
      }
    } catch {
      /* gateway still booting */
    }
    if (Date.now() + intervalMs >= deadline) return "";
    await new Promise<void>((r) => setTimeout(r, intervalMs).unref());
  }
}

/** Accepts the gateway's `{"version": ...}` JSON payload or a plain-text body; anything else yields "". */
export function parseVersionPayload(body: string): string {
  try {
    const parsed = JSON.parse(body) as { version?: unknown };
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.version === "string"
    ) {
      return cleanGatewayVersion(parsed.version);
    }
  } catch {
    /* plain-text body */
  }
  return cleanGatewayVersion(body);
}

/** Mirrors the CLI's cleanVersion: normalizes v0.50.0 to 0.50.0 and rejects values that do not look like one. */
export function cleanGatewayVersion(value: string): string {
  const v = value.trim().replace(/^v/, "");
  const first = v[0] ?? "";
  if (v === "" || v.length > 32 || first < "0" || first > "9") return "";
  return /^[0-9A-Za-z.+-]+$/.test(v) ? v : "";
}

/** Extracts the version from a container image tag (…/inference-gateway:v0.50.0 -> 0.50.0); floating tags say nothing. */
export function parseImageVersion(image: string): string {
  let tag = image.slice(image.lastIndexOf("/") + 1);
  const idx = tag.indexOf(":");
  if (idx >= 0) tag = tag.slice(idx + 1);
  return cleanGatewayVersion(tag);
}

/** The effective `gateway.*` config the agent runs with, via one `config get gateway --format json`; null when the CLI is unavailable. */
export function readGatewayConfig(
  inferBin: string,
  env: NodeJS.ProcessEnv,
): GatewayConfig | null {
  try {
    const res = spawnSync(
      inferBin,
      ["config", "get", "gateway", "--format", "json"],
      {
        env,
        encoding: "utf8",
        timeout: 15_000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    if (res.status !== 0) return null;
    return parseGatewayConfig(res.stdout ?? "");
  } catch {
    return null;
  }
}

export function parseGatewayConfig(json: string): GatewayConfig | null {
  const raw = JSON.parse(json) as Record<string, unknown>;
  const url = typeof raw["url"] === "string" ? raw["url"] : "";
  if (!url) return null;
  return {
    url,
    run: raw["run"] !== false,
    oci: typeof raw["oci"] === "string" ? raw["oci"] : "",
    standaloneBinary: raw["standalone_binary"] === true,
  };
}

/** Where the CLI's supervisor keeps the managed gateway binary. */
export function gatewayBinaryPath(home = homedir()): string {
  const name =
    process.platform === "win32"
      ? "inference-gateway.exe"
      : "inference-gateway";
  return join(home, ".infer", "bin", name);
}

export function binaryGatewayVersion(
  exec: typeof spawnSync = spawnSync,
  path = gatewayBinaryPath(),
): string {
  try {
    const res = exec(path, ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const fields = (res.stdout ?? "").trim().split(/\s+/).filter(Boolean);
    if (res.status !== 0) return "";
    return cleanGatewayVersion(fields[fields.length - 1] ?? "");
  } catch {
    return "";
  }
}

/** Runner-side handoff to the separate report process, latest-wins like the todos file. */
export function persistGatewayVersion(version: string): void {
  try {
    writeFileSync(GATEWAY_VERSION_PATH, version);
  } catch (e) {
    console.error("[gateway] failed to persist gateway version:", e);
  }
}

export function readPersistedGatewayVersion(): string {
  try {
    return readFileSync(GATEWAY_VERSION_PATH, "utf8").trim();
  } catch {
    return "";
  }
}

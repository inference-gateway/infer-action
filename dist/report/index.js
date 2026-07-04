#!/usr/bin/env bun
// @bun

// src/report.ts
import { appendFileSync as appendFileSync2, readFileSync as readFileSync2 } from "fs";

// src/duration.ts
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m ${seconds}s`;
}

// src/version.ts
var INFER_VERSION = "0.6.0";

// src/otel.ts
function loadOtelConfig(env) {
  return {
    endpoint: env["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "",
    headers: env["OTEL_EXPORTER_OTLP_HEADERS"] ?? "",
    protocol: env["OTEL_EXPORTER_OTLP_PROTOCOL"] ?? "http/json",
    serviceName: env["OTEL_SERVICE_NAME"] ?? "infer-action",
    resourceAttributes: env["OTEL_RESOURCE_ATTRIBUTES"] ?? "",
    signals: env["OTEL_SIGNALS"] ?? "metrics",
    timeoutMs: Number(env["OTEL_EXPORT_TIMEOUT_MS"] ?? "5000")
  };
}
function stringAttr(key, value) {
  return { key, value: { stringValue: value } };
}
function intAttr(key, value) {
  return { key, value: { intValue: String(value) } };
}
function resolveServiceVersion() {
  return process.env["GITHUB_ACTION_REF"] || INFER_VERSION || "unknown";
}
function buildResourceAttributes(config, telemetry, redactor) {
  const attrs = [
    stringAttr("service.name", config.serviceName),
    stringAttr("service.version", resolveServiceVersion()),
    stringAttr("gen_ai.provider.name", extractProvider(telemetry.modelUsed)),
    stringAttr("cicd.pipeline.name", extractWorkflowName(telemetry.workflowUrl)),
    stringAttr("cicd.pipeline.run.id", telemetry.runId),
    stringAttr("vcs.repository.name", telemetry.repo),
    stringAttr("vcs.repository.ref", telemetry.ref),
    stringAttr("vcs.repository.sha", telemetry.sha),
    stringAttr("github.actor", telemetry.actor),
    stringAttr("github.event_name", telemetry.eventName)
  ];
  if (telemetry.issueNumber) {
    attrs.push(stringAttr("github.issue.number", telemetry.issueNumber));
  }
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
function buildMetricsPayload(config, telemetry, redactor) {
  const nowUnixNano = BigInt(Date.now()) * BigInt(1e6);
  const startUnixNano = telemetry.durationMs > 0 ? BigInt(Date.now() - telemetry.durationMs) * BigInt(1e6) : nowUnixNano;
  const resourceAttrs = buildResourceAttributes(config, telemetry, redactor);
  const modelAttr = stringAttr("gen_ai.request.model", telemetry.modelUsed);
  const providerAttr = stringAttr("gen_ai.provider.name", extractProvider(telemetry.modelUsed));
  const metrics = [];
  if (telemetry.usage.totalTokens > 0) {
    metrics.push({
      name: "gen_ai.client.token.usage",
      unit: "{token}",
      histogram: {
        dataPoints: [
          {
            startTimeUnixNano: String(startUnixNano),
            timeUnixNano: String(nowUnixNano),
            count: "1",
            sum: telemetry.usage.promptTokens,
            bucketCounts: ["1"],
            explicitBounds: [],
            attributes: [
              modelAttr,
              providerAttr,
              stringAttr("gen_ai.token.type", "input")
            ]
          },
          {
            startTimeUnixNano: String(startUnixNano),
            timeUnixNano: String(nowUnixNano),
            count: "1",
            sum: telemetry.usage.completionTokens,
            bucketCounts: ["1"],
            explicitBounds: [],
            attributes: [
              modelAttr,
              providerAttr,
              stringAttr("gen_ai.token.type", "output")
            ]
          }
        ],
        aggregationTemporality: 2
      }
    });
  }
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
              stringAttr("infer.cost.type", "input")
            ]
          },
          {
            startTimeUnixNano: String(startUnixNano),
            timeUnixNano: String(nowUnixNano),
            asDouble: cost.output,
            attributes: [
              modelAttr,
              providerAttr,
              stringAttr("infer.cost.type", "output")
            ]
          }
        ],
        aggregationTemporality: 2,
        isMonotonic: true
      }
    });
  }
  if (telemetry.toolCallCounts.total > 0) {
    const toolCallDataPoints = [];
    const allToolNames = new Set([
      ...Object.keys(telemetry.toolCallCounts.perToolSuccess),
      ...Object.keys(telemetry.toolCallCounts.perToolError)
    ]);
    for (const tool of allToolNames) {
      const success = telemetry.toolCallCounts.perToolSuccess[tool] ?? 0;
      const errors = telemetry.toolCallCounts.perToolError[tool] ?? 0;
      if (success > 0) {
        toolCallDataPoints.push({
          startTimeUnixNano: String(startUnixNano),
          timeUnixNano: String(nowUnixNano),
          asInt: String(success),
          attributes: [
            stringAttr("gen_ai.tool.name", tool),
            stringAttr("infer.tool.outcome", "success")
          ]
        });
      }
      if (errors > 0) {
        toolCallDataPoints.push({
          startTimeUnixNano: String(startUnixNano),
          timeUnixNano: String(nowUnixNano),
          asInt: String(errors),
          attributes: [
            stringAttr("gen_ai.tool.name", tool),
            stringAttr("infer.tool.outcome", "error"),
            stringAttr("error.type", "tool_error")
          ]
        });
      }
    }
    metrics.push({
      name: "infer.agent.tool.calls",
      unit: "{call}",
      sum: {
        dataPoints: toolCallDataPoints,
        aggregationTemporality: 2,
        isMonotonic: true
      }
    });
  }
  const outcome = determineOutcome(telemetry);
  const runAttrs = [stringAttr("infer.run.outcome", outcome)];
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
          attributes: runAttrs
        }
      ],
      aggregationTemporality: 2,
      isMonotonic: true
    }
  });
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
            attributes: [stringAttr("infer.run.outcome", outcome)]
          }
        ]
      }
    });
  }
  return {
    resourceMetrics: [
      {
        resource: { attributes: resourceAttrs },
        scopeMetrics: [
          {
            scope: { name: "infer-action" },
            metrics
          }
        ]
      }
    ]
  };
}
function buildTracesPayload(config, telemetry, redactor) {
  const nowUnixNano = BigInt(Date.now()) * BigInt(1e6);
  const startUnixNano = telemetry.durationMs > 0 ? BigInt(Date.now() - telemetry.durationMs) * BigInt(1e6) : nowUnixNano;
  const resourceAttrs = buildResourceAttributes(config, telemetry, redactor);
  const traceId = generateTraceId();
  const spanId = generateSpanId();
  const outcome = determineOutcome(telemetry);
  const spans = [
    {
      traceId,
      spanId,
      name: "infer.agent.run",
      kind: 1,
      startTimeUnixNano: String(startUnixNano),
      endTimeUnixNano: String(nowUnixNano),
      status: {
        code: outcome === "success" ? 0 : 2,
        message: outcome === "success" ? "" : `exit code ${telemetry.exitCode}`
      },
      attributes: [
        stringAttr("infer.run.outcome", outcome),
        stringAttr("gen_ai.request.model", telemetry.modelUsed),
        stringAttr("gen_ai.provider.name", extractProvider(telemetry.modelUsed)),
        intAttr("infer.run.exit_code", Number(telemetry.exitCode)),
        intAttr("infer.run.duration_ms", telemetry.durationMs),
        intAttr("infer.run.total_tokens", telemetry.usage.totalTokens),
        intAttr("infer.run.tool_calls", telemetry.usage.toolCalls),
        intAttr("infer.run.failed_tool_calls", telemetry.failures.length)
      ]
    }
  ];
  return {
    resourceSpans: [
      {
        resource: { attributes: resourceAttrs },
        scopeSpans: [
          {
            scope: { name: "infer-action" },
            spans
          }
        ]
      }
    ]
  };
}
function buildLogsPayload(config, telemetry, redactor) {
  const nowUnixNano = BigInt(Date.now()) * BigInt(1e6);
  const resourceAttrs = buildResourceAttributes(config, telemetry, redactor);
  const logRecords = [];
  for (const failure of telemetry.failures) {
    logRecords.push({
      timeUnixNano: String(nowUnixNano),
      severityNumber: 17,
      severityText: "ERROR",
      body: {
        stringValue: redactor.redact(`Tool call failed: ${failure.tool} - ${failure.message}`)
      },
      attributes: [
        stringAttr("gen_ai.tool.name", failure.tool),
        stringAttr("error.type", "tool_error"),
        stringAttr("infer.run.outcome", determineOutcome(telemetry)),
        stringAttr("gen_ai.request.model", telemetry.modelUsed)
      ]
    });
  }
  return {
    resourceLogs: [
      {
        resource: { attributes: resourceAttrs },
        scopeLogs: [
          {
            scope: { name: "infer-action" },
            logRecords
          }
        ]
      }
    ]
  };
}
async function postJson(url, body, headers, timeoutMs, signal) {
  if (signal.aborted) {
    console.log(`[otel] POST ${url} skipped (signal already aborted)`);
    return;
  }
  const controller = new AbortController;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  signal.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "(no body)");
      console.error(`[otel] POST ${url} returned ${response.status}: ${text}`);
    } else {
      console.log(`[otel] POST ${url} \u2192 ${response.status}`);
    }
  } catch (err) {
    if (err.name === "AbortError") {
      console.error(`[otel] POST ${url} timed out after ${timeoutMs}ms`);
    } else {
      console.error(`[otel] POST ${url} failed:`, err.message);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
async function exportTelemetry(config, telemetry, redactor, dryRun, signal = new AbortController().signal) {
  if (!config.endpoint) {
    console.log("[otel] no endpoint configured; skipping export");
    return;
  }
  const signals = config.signals.split(",").map((s) => s.trim().toLowerCase());
  const baseUrl = config.endpoint.replace(/\/+$/, "");
  const headerMap = {};
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
  if (signals.includes("traces")) {
    const payload = buildTracesPayload(config, telemetry, redactor);
    const url = `${baseUrl}/v1/traces`;
    if (dryRun) {
      console.log(`[dry-run] would export traces to ${url}`);
    } else {
      await postJson(url, payload, headerMap, config.timeoutMs, signal);
    }
  }
  if (signals.includes("logs")) {
    const payload = buildLogsPayload(config, telemetry, redactor);
    const url = `${baseUrl}/v1/logs`;
    if (dryRun) {
      const logCount = payload.resourceLogs[0]?.scopeLogs[0]?.logRecords.length ?? 0;
      console.log(`[dry-run] would export ${logCount} log records to ${url}`);
    } else {
      await postJson(url, payload, headerMap, config.timeoutMs, signal);
    }
  }
}
function extractProvider(model) {
  const slash = model.indexOf("/");
  return slash > 0 ? model.slice(0, slash) : "unknown";
}
function extractWorkflowName(workflowUrl) {
  const workflowRef = process.env["GITHUB_WORKFLOW_REF"];
  if (workflowRef) {
    const pathPart = workflowRef.split("@")[0] ?? "";
    const name = pathPart.split("/").pop();
    if (name)
      return name;
  }
  if (workflowUrl)
    return "infer-action";
  return "unknown";
}
function determineOutcome(telemetry) {
  if (telemetry.timedOut)
    return "stopped_early";
  if (telemetry.stoppedEarly)
    return "stopped_early";
  if (telemetry.exitCode !== "0")
    return "failed";
  return "success";
}
function generateTraceId() {
  return randomHex(32);
}
function generateSpanId() {
  return randomHex(16);
}
function randomHex(length) {
  const bytes = new Uint8Array(length / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function countMetrics(payload) {
  try {
    const p = payload;
    return p.resourceMetrics[0]?.scopeMetrics[0]?.metrics.length ?? 0;
  } catch {
    return 0;
  }
}

// src/parser.ts
import { createReadStream, existsSync } from "fs";
import readline from "readline";
async function parseAgentOutput(path) {
  if (!existsSync(path))
    return [];
  const messages = [];
  for await (const msg of readJsonLines(createReadStream(path))) {
    messages.push(msg);
  }
  return messages;
}
async function* readJsonLines(input) {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed)
      continue;
    if (trimmed[0] !== "{")
      continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed !== "object" || parsed === null)
        continue;
      const role = parsed.role;
      const type = parsed.type;
      if (typeof role === "string" || type === "session_stats" || type === "compaction_started" || type === "compaction_completed") {
        yield parsed;
      }
    } catch {}
  }
}

// src/context.ts
async function loadContext(env, github) {
  const kind = env["INFER_CONTEXT_KIND"];
  if (!kind) {
    throw new Error("Missing required env var INFER_CONTEXT_KIND");
  }
  if (kind === "issue") {
    return loadIssueContext(env, github);
  }
  if (kind === "pull_request") {
    return loadPullRequestContext(env, github);
  }
  if (kind === "direct") {
    return loadDirectContext(env);
  }
  throw new Error(`Unknown INFER_CONTEXT_KIND "${kind}" (expected "issue", "pull_request", or "direct")`);
}
function loadFallbackContext(env) {
  const kind = env["INFER_CONTEXT_KIND"];
  if (kind === "direct") {
    return {
      kind: "direct",
      prompt: (env["INFER_DIRECT_PROMPT"] ?? "").trim() || "(dry-run: no prompt)"
    };
  }
  if (kind === "pull_request") {
    return {
      kind: "pull_request",
      prNumber: Number.parseInt(env["INFER_ISSUE_NUMBER"] ?? "0", 10) || 0,
      prTitle: "(dry-run: PR title unavailable)",
      prBody: "",
      headRef: "(unknown)",
      baseRef: "main",
      headRepoFullName: "",
      isFork: false,
      triggeringCommentId: 0,
      comments: []
    };
  }
  return {
    kind: "issue",
    issueNumber: Number.parseInt(env["INFER_ISSUE_NUMBER"] ?? "0", 10) || 0,
    issueTitle: env["INFER_ISSUE_TITLE"] ?? "",
    issueBody: env["INFER_ISSUE_BODY"] ?? ""
  };
}
function loadDirectContext(env) {
  const prompt = (env["INFER_DIRECT_PROMPT"] ?? "").trim();
  if (!prompt) {
    throw new Error("Missing or empty INFER_DIRECT_PROMPT for direct context");
  }
  return { kind: "direct", prompt };
}
async function loadIssueContext(env, github) {
  const issueNumber = Number.parseInt(env["INFER_ISSUE_NUMBER"] ?? "", 10);
  if (!Number.isFinite(issueNumber)) {
    throw new Error("Missing or invalid INFER_ISSUE_NUMBER");
  }
  const issueTitle = env["INFER_ISSUE_TITLE"] ?? "";
  const issueBody = env["INFER_ISSUE_BODY"] ?? "";
  const triggeringComment = parseTriggeringComment(env);
  const { associatedPrs, associatedBranches } = await gatherExistingWork(github, issueNumber);
  return {
    kind: "issue",
    issueNumber,
    issueTitle,
    issueBody,
    ...triggeringComment ? { triggeringComment } : {},
    ...associatedPrs.length ? { associatedPrs } : {},
    ...associatedBranches.length ? { associatedBranches } : {}
  };
}
async function gatherExistingWork(github, issueNumber) {
  const conventionalBranch = `fix/issue-${issueNumber}`;
  try {
    const [byBranch, byRef] = await Promise.all([
      github.getOpenPrForBranch(conventionalBranch),
      github.findPrsReferencingIssue(issueNumber)
    ]);
    const byNumber = new Map;
    for (const pr of byRef)
      byNumber.set(pr.number, pr);
    if (byBranch) {
      const existing = byNumber.get(byBranch.number);
      byNumber.set(byBranch.number, {
        number: byBranch.number,
        url: existing?.url || byBranch.url,
        state: existing?.state || "open",
        headRef: conventionalBranch,
        baseRef: byBranch.baseRef,
        isDraft: existing?.isDraft ?? false,
        title: existing?.title ?? ""
      });
    }
    const associatedPrs = [...byNumber.values()];
    const associatedBranches = byBranch ? [conventionalBranch] : [];
    return { associatedPrs, associatedBranches };
  } catch (e) {
    console.warn(`[context] failed to gather existing work for issue #${issueNumber}; proceeding without it:`, e instanceof Error ? e.message : e);
    return { associatedPrs: [], associatedBranches: [] };
  }
}
async function loadPullRequestContext(env, github) {
  const prNumber = Number.parseInt(env["INFER_ISSUE_NUMBER"] ?? "", 10);
  if (!Number.isFinite(prNumber)) {
    throw new Error("Missing or invalid INFER_ISSUE_NUMBER for PR context");
  }
  const [pr, rawComments] = await Promise.all([
    github.getPullRequest(prNumber),
    github.listIssueComments(prNumber)
  ]);
  const triggeringCommentId = Number.parseInt(env["INFER_TRIGGERING_COMMENT_ID"] ?? "", 10);
  const triggerId = Number.isFinite(triggeringCommentId) ? triggeringCommentId : 0;
  const comments = rawComments.map((c) => ({
    id: c.id,
    author: c.author,
    body: c.body,
    createdAt: c.createdAt,
    isTrigger: triggerId > 0 && c.id === triggerId
  }));
  const selfFullName = `${github.owner}/${github.repoName}`;
  const isFork = pr.headRepoFullName !== "" && pr.headRepoFullName !== selfFullName;
  return {
    kind: "pull_request",
    prNumber,
    prTitle: pr.title,
    prBody: pr.body,
    headRef: pr.headRef,
    baseRef: pr.baseRef,
    headRepoFullName: pr.headRepoFullName,
    isFork,
    triggeringCommentId: triggerId,
    comments
  };
}
function parseTriggeringComment(env) {
  const idRaw = env["INFER_TRIGGERING_COMMENT_ID"] ?? "";
  const body = env["INFER_TRIGGERING_COMMENT_BODY"] ?? "";
  const author = env["INFER_TRIGGERING_COMMENT_AUTHOR"] ?? "";
  const id = Number.parseInt(idRaw, 10);
  if (!Number.isFinite(id) || id <= 0)
    return;
  if (!body.trim())
    return;
  return { id, body, author };
}

// src/github-api.ts
class GithubApi {
  token;
  baseUrl;
  fetchImpl;
  constructor(opts) {
    this.token = opts.token;
    this.baseUrl = (opts.baseUrl || process.env["GITHUB_API_URL"] || "https://api.github.com").replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }
  issues = {
    getComment: (p) => this.request("GET", `/repos/${p.owner}/${p.repo}/issues/comments/${p.comment_id}`),
    updateComment: (p) => this.request("PATCH", `/repos/${p.owner}/${p.repo}/issues/comments/${p.comment_id}`, undefined, { body: p.body }),
    createComment: (p) => this.request("POST", `/repos/${p.owner}/${p.repo}/issues/${p.issue_number}/comments`, undefined, { body: p.body }),
    listComments: (p) => this.request("GET", `/repos/${p.owner}/${p.repo}/issues/${p.issue_number}/comments`, { per_page: p.per_page, page: p.page }),
    listEventsForTimeline: (p) => this.request("GET", `/repos/${p.owner}/${p.repo}/issues/${p.issue_number}/timeline`, { per_page: p.per_page })
  };
  pulls = {
    list: (p) => this.request("GET", `/repos/${p.owner}/${p.repo}/pulls`, {
      head: p.head,
      state: p.state,
      per_page: p.per_page
    }),
    get: (p) => this.request("GET", `/repos/${p.owner}/${p.repo}/pulls/${p.pull_number}`),
    create: (p) => this.request("POST", `/repos/${p.owner}/${p.repo}/pulls`, undefined, {
      head: p.head,
      base: p.base,
      title: p.title,
      body: p.body,
      draft: p.draft
    }),
    update: (p) => this.request("PATCH", `/repos/${p.owner}/${p.repo}/pulls/${p.pull_number}`, undefined, { body: p.body })
  };
  repos = {
    get: (p) => this.request("GET", `/repos/${p.owner}/${p.repo}`)
  };
  async request(method, path, query, body) {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams;
      for (const [key, value] of Object.entries(query)) {
        params.set(key, String(value));
      }
      url += `?${params.toString()}`;
    }
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "infer-action"
    };
    if (this.token)
      headers["Authorization"] = `Bearer ${this.token}`;
    if (body !== undefined)
      headers["Content-Type"] = "application/json";
    const res = await this.fetchImpl(url, {
      method,
      headers,
      ...body !== undefined ? { body: JSON.stringify(body) } : {}
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub API ${method} ${path} -> ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
    }
    if (res.status === 204) {
      return { data: undefined };
    }
    return { data: await res.json() };
  }
}

// src/github.ts
var PLAN_END = "<!-- infer:plan-end -->";
var RESULT_START = "<!-- infer:result-start -->";
var SPINNER_START = "<!-- infer:spinner -->";
var SPINNER_END = "<!-- /infer:spinner -->";
var SPINNER_BLOCK = `${SPINNER_START}<img src="https://raw.githubusercontent.com/inference-gateway/infer-action/main/assets/spinner.svg" width="22" height="22" alt="Working" />${SPINNER_END}`;
function stripSpinner(body) {
  const start = body.indexOf(SPINNER_START);
  if (start === -1)
    return body;
  const endMarker = body.indexOf(SPINNER_END, start);
  if (endMarker === -1)
    return body;
  let tail = endMarker + SPINNER_END.length;
  while (tail < body.length && (body[tail] === `
` || body[tail] === "\r")) {
    tail++;
  }
  return body.slice(0, start) + body.slice(tail);
}
function splitZones(body) {
  const planEndIdx = body.indexOf(PLAN_END);
  const resultStartIdx = body.indexOf(RESULT_START);
  if (planEndIdx === -1 && resultStartIdx === -1) {
    return { plan: body, middle: "", result: "" };
  }
  if (planEndIdx === -1) {
    return {
      plan: body.slice(0, resultStartIdx),
      middle: "",
      result: body.slice(resultStartIdx + RESULT_START.length)
    };
  }
  if (resultStartIdx === -1) {
    return {
      plan: body.slice(0, planEndIdx),
      middle: body.slice(planEndIdx + PLAN_END.length),
      result: ""
    };
  }
  return {
    plan: body.slice(0, planEndIdx),
    middle: body.slice(planEndIdx + PLAN_END.length, resultStartIdx),
    result: body.slice(resultStartIdx + RESULT_START.length)
  };
}
function joinZones(zones) {
  const plan = zones.plan.trim();
  const middle = zones.middle.trim();
  const result = zones.result.trim();
  if (!middle && !result)
    return plan;
  let body = plan;
  body += `

${PLAN_END}`;
  if (middle)
    body += `

${middle}`;
  body += `

${RESULT_START}`;
  if (result)
    body += `

${result}`;
  return body;
}

class GithubClient {
  api;
  redactor;
  dryRun;
  owner;
  repoName;
  constructor(opts) {
    this.api = opts.api ?? new GithubApi({ token: opts.token });
    this.redactor = opts.redactor;
    this.dryRun = opts.dryRun ?? false;
    const [owner, name] = opts.repo.split("/");
    if (!owner || !name) {
      throw new Error(`Invalid repo string "${opts.repo}", expected "owner/name"`);
    }
    this.owner = owner;
    this.repoName = name;
  }
  commentUrl(commentId) {
    return `https://github.com/${this.owner}/${this.repoName}/issues/comments/${commentId}`;
  }
  issueUrl(issueNumber) {
    return `https://github.com/${this.owner}/${this.repoName}/issues/${issueNumber}`;
  }
  prUrl(prNumber) {
    return `https://github.com/${this.owner}/${this.repoName}/pull/${prNumber}`;
  }
  async getCommentBody(commentId) {
    const res = await this.api.issues.getComment({
      owner: this.owner,
      repo: this.repoName,
      comment_id: commentId
    });
    return res.data.body ?? "";
  }
  async updateCommentBody(commentId, body) {
    const safeBody = this.redactor ? this.redactor.redact(body) : body;
    if (this.dryRun) {
      console.log(`[dry-run] would update comment #${commentId} (${this.commentUrl(commentId)}):
${safeBody}`);
      return;
    }
    await this.api.issues.updateComment({
      owner: this.owner,
      repo: this.repoName,
      comment_id: commentId,
      body: safeBody
    });
  }
  async createIssueComment(issueNumber, body) {
    const safeBody = this.redactor ? this.redactor.redact(body) : body;
    if (this.dryRun) {
      console.log(`[dry-run] would create a github issue comment on issue #${issueNumber} (${this.issueUrl(issueNumber)}):
${safeBody}`);
      return;
    }
    await this.api.issues.createComment({
      owner: this.owner,
      repo: this.repoName,
      issue_number: issueNumber,
      body: safeBody
    });
  }
  async updateZone(commentId, zone, newContent) {
    if (this.dryRun) {
      const safe = this.redactor ? this.redactor.redact(newContent) : newContent;
      console.log(`[dry-run] would update the ${zone} zone of comment #${commentId} (${this.commentUrl(commentId)}):
${safe}`);
      return;
    }
    const body = await this.getCommentBody(commentId);
    const zones = splitZones(body);
    zones[zone] = newContent;
    await this.updateCommentBody(commentId, joinZones(zones));
  }
  async clearSpinner(commentId) {
    if (this.dryRun) {
      console.log(`[dry-run] would clear the spinner on comment #${commentId} (${this.commentUrl(commentId)})`);
      return;
    }
    const body = await this.getCommentBody(commentId);
    const stripped = stripSpinner(body);
    if (stripped === body)
      return;
    await this.updateCommentBody(commentId, stripped);
  }
  async getOpenPrForBranch(head) {
    const res = await this.api.pulls.list({
      owner: this.owner,
      repo: this.repoName,
      head: `${this.owner}:${head}`,
      state: "open",
      per_page: 1
    });
    const pr = res.data[0];
    if (!pr)
      return null;
    return {
      number: pr.number,
      url: pr.html_url,
      body: pr.body ?? "",
      baseRef: pr.base.ref
    };
  }
  async getPrForBranch(head) {
    const res = await this.api.pulls.list({
      owner: this.owner,
      repo: this.repoName,
      head: `${this.owner}:${head}`,
      state: "all",
      per_page: 20
    });
    const toBranchPr = (pr) => ({
      number: pr.number,
      url: pr.html_url,
      body: pr.body ?? "",
      baseRef: pr.base.ref,
      state: pr.state === "open" ? "open" : "closed",
      merged: pr.merged_at != null
    });
    const open = res.data.find((pr) => pr.state === "open");
    if (open)
      return toBranchPr(open);
    const merged = res.data.find((pr) => pr.merged_at != null);
    if (merged)
      return toBranchPr(merged);
    const newest = res.data[0];
    return newest ? toBranchPr(newest) : null;
  }
  async findPrsReferencingIssue(issueNumber) {
    const res = await this.api.issues.listEventsForTimeline({
      owner: this.owner,
      repo: this.repoName,
      issue_number: issueNumber,
      per_page: 100
    });
    const events = res.data;
    const byNumber = new Map;
    for (const e of events) {
      if (e.event !== "cross-referenced")
        continue;
      const issue = e.source?.issue;
      if (!issue || !issue.pull_request || typeof issue.number !== "number") {
        continue;
      }
      byNumber.set(issue.number, {
        number: issue.number,
        url: issue.html_url ?? "",
        state: issue.state ?? "",
        headRef: "",
        baseRef: "",
        isDraft: issue.draft ?? false,
        title: issue.title ?? ""
      });
    }
    return [...byNumber.values()];
  }
  async updatePullRequestBody(prNumber, body) {
    const safeBody = this.redactor ? this.redactor.redact(body) : body;
    if (this.dryRun) {
      console.log(`[dry-run] would update PR #${prNumber} body (${this.prUrl(prNumber)}):
${safeBody}`);
      return;
    }
    await this.api.pulls.update({
      owner: this.owner,
      repo: this.repoName,
      pull_number: prNumber,
      body: safeBody
    });
  }
  async createDraftPr(input) {
    const safeBody = this.redactor ? this.redactor.redact(input.body) : input.body;
    if (this.dryRun) {
      console.log(`[dry-run] would open a DRAFT PR ${input.head} -> ${input.base} titled "${input.title}":
${safeBody}`);
      return {
        number: 0,
        url: "(dry-run)",
        body: safeBody,
        baseRef: input.base
      };
    }
    const res = await this.api.pulls.create({
      owner: this.owner,
      repo: this.repoName,
      head: input.head,
      base: input.base,
      title: input.title,
      body: safeBody,
      draft: true
    });
    return {
      number: res.data.number,
      url: res.data.html_url,
      body: res.data.body ?? "",
      baseRef: res.data.base.ref
    };
  }
  async getDefaultBranch() {
    const res = await this.api.repos.get({
      owner: this.owner,
      repo: this.repoName
    });
    return res.data.default_branch;
  }
  async getPullRequest(prNumber) {
    const res = await this.api.pulls.get({
      owner: this.owner,
      repo: this.repoName,
      pull_number: prNumber
    });
    return {
      title: res.data.title,
      body: res.data.body ?? "",
      headRef: res.data.head.ref,
      headRepoFullName: res.data.head.repo?.full_name ?? "",
      baseRef: res.data.base.ref
    };
  }
  async listIssueComments(issueOrPrNumber) {
    const collected = [];
    const maxPages = 2;
    for (let page = 1;page <= maxPages; page++) {
      const res = await this.api.issues.listComments({
        owner: this.owner,
        repo: this.repoName,
        issue_number: issueOrPrNumber,
        per_page: 100,
        page
      });
      for (const c of res.data) {
        collected.push({
          id: c.id,
          author: c.user?.login ?? "unknown",
          body: c.body ?? "",
          createdAt: c.created_at
        });
      }
      if (res.data.length < 100)
        break;
    }
    return collected;
  }
}

// src/redact.ts
var SECRET_ENV_NAMES = [
  "GITHUB_TOKEN",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "DEEPSEEK_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "CLOUDFLARE_API_KEY",
  "COHERE_API_KEY",
  "OLLAMA_API_KEY",
  "OLLAMA_CLOUD_API_KEY",
  "MOONSHOT_API_KEY",
  "MINIMAX_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "MEMORY_TOKEN",
  "MEMORY_DEPLOY_KEY"
];
var ALWAYS_ON_PATTERNS = [
  "-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----[\\s\\S]+?-----END [A-Z ]*PRIVATE KEY( BLOCK)?-----"
];
var HEURISTIC_PATTERNS = [
  "github_pat_[A-Za-z0-9_]{82,}",
  "gh[pours]_[A-Za-z0-9]{36,}",
  "AIza[0-9A-Za-z_-]{35}",
  "xox[bpoa]-[A-Za-z0-9-]{20,}",
  "sk-[A-Za-z0-9_-]{20,}",
  "eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]{10,}"
];
var DEFAULT_MIN_LENGTH = 8;
var DEFAULT_PLACEHOLDER = "***";
var REGEX_META = /[.*+?^${}()|[\]\\]/g;
function collectSecretValues(env, names, minLength = DEFAULT_MIN_LENGTH) {
  const out = [];
  const seen = new Set;
  for (const name of names) {
    const v = env[name];
    if (typeof v !== "string")
      continue;
    if (v.trim().length < minLength)
      continue;
    if (seen.has(v))
      continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
function emitAddMaskDirectives(values) {
  const seen = new Set;
  for (const v of values) {
    if (!v || seen.has(v))
      continue;
    seen.add(v);
    process.stdout.write(`::add-mask::${v}
`);
  }
}
function createRedactor(opts = {}) {
  const placeholder = opts.placeholder ?? DEFAULT_PLACEHOLDER;
  const minLength = opts.minLength ?? DEFAULT_MIN_LENGTH;
  const env = opts.env ?? process.env;
  const heuristics = opts.heuristics ?? false;
  const values = collectSecretValues(env, SECRET_ENV_NAMES, minLength);
  values.sort((a, b) => b.length - a.length);
  const alternation = values.map(escapeRegex);
  alternation.push(...ALWAYS_ON_PATTERNS);
  if (heuristics)
    alternation.push(...HEURISTIC_PATTERNS);
  const pattern = alternation.length > 0 ? new RegExp(alternation.join("|"), "g") : null;
  return {
    secretCount: values.length,
    redact(input) {
      if (!pattern || !input)
        return input;
      return input.replace(pattern, placeholder);
    }
  };
}
function escapeRegex(s) {
  return s.replace(REGEX_META, "\\$&");
}

// src/prelude.ts
var AGENT_OUTPUT_PATH = "/tmp/agent-output.txt";
var TODOS_PATH = "/tmp/infer-todos.json";
var CANCEL_MARKER_PATH = "/tmp/infer-cancelled";
function required(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var ${name}`);
  }
  return v;
}
function optional(name) {
  return process.env[name] ?? "";
}
function bootEntry() {
  const dryRun = optional("INFER_DRY_RUN") === "true";
  const token = dryRun ? optional("GITHUB_TOKEN") : required("GITHUB_TOKEN");
  const repo = required("INFER_REPO");
  const enableGitOps = optional("INFER_ENABLE_GIT_OPERATIONS") !== "false";
  const enableHeuristics = optional("INFER_REDACT_HEURISTICS") === "true";
  const secretValues = collectSecretValues(process.env, SECRET_ENV_NAMES);
  emitAddMaskDirectives(secretValues);
  const redactor = createRedactor({
    env: process.env,
    heuristics: enableHeuristics
  });
  const github = new GithubClient({ token, repo, redactor, dryRun });
  return {
    dryRun,
    token,
    repo,
    enableGitOps,
    enableHeuristics,
    redactor,
    github
  };
}
async function loadContextOrFallback(env, github, opts) {
  try {
    return await loadContext(env, github);
  } catch (e) {
    if (opts.failHard)
      throw e;
    console.warn(`[${opts.stepName}] context read failed (${e.message}); proceeding with env-derived data`);
    return loadFallbackContext(env);
  }
}

// src/recovery.ts
import { execFileSync } from "child_process";
import {
  appendFileSync,
  existsSync as existsSync2,
  readFileSync,
  rmSync,
  writeFileSync
} from "fs";

// src/pr-body.ts
var LINK_ONLY_LINE = /^(resolves|closes|fixes)\s+#\d+\.?$/i;
function isThinPrBody(body) {
  const trimmed = body.trim();
  if (!trimmed)
    return true;
  const withoutLink = trimmed.split(`
`).filter((line) => !LINK_ONLY_LINE.test(line.trim())).join(`
`).trim();
  if (!withoutLink)
    return true;
  return withoutLink.length < 40 && !withoutLink.includes("##");
}
function buildPrBody(input) {
  const lines = [];
  if (input.issueNumber) {
    lines.push(`Resolves #${input.issueNumber}`, "");
  }
  lines.push("## Summary", "", input.note ?? "_The agent's original PR description was incomplete, so this summary was generated from the commit history._", "", "## Changes", "");
  const subjects = input.commitSubjects.map((s) => s.trim()).filter((s) => s.length > 0);
  if (subjects.length > 0) {
    for (const subject of subjects)
      lines.push(`- ${subject}`);
  } else {
    lines.push("- (no commits found on this branch)");
  }
  const diffStat = input.diffStat.trim();
  if (diffStat) {
    lines.push("", "<details><summary>Files changed</summary>", "", "```", diffStat, "```", "", "</details>");
  }
  return lines.join(`
`);
}

// src/recovery.ts
var SH_TIMEOUT_MS = 60000;
function cancelMarkerPresent() {
  try {
    return existsSync2(CANCEL_MARKER_PATH);
  } catch {
    return false;
  }
}
function finalizeStatus(runAgentExitCode, incompleteOrDirty, cancelled) {
  if (cancelled) {
    return {
      exitCode: "0",
      timedOut: true,
      stoppedEarly: true,
      result: "Agent stopped early (hit the job time limit); work recovered"
    };
  }
  if (runAgentExitCode === "") {
    return {
      exitCode: "1",
      timedOut: false,
      stoppedEarly: true,
      result: "run-agent did not complete (no exit code - it crashed or an earlier step failed)"
    };
  }
  const result = runAgentExitCode === "0" ? "Agent completed successfully" : `Agent failed with exit code ${runAgentExitCode}`;
  return {
    exitCode: runAgentExitCode,
    timedOut: false,
    stoppedEarly: incompleteOrDirty,
    result
  };
}
async function linkAgentPr(args) {
  const branch = sh("git branch --show-current").trim();
  if (!branch || branch === "main" || branch === "master" || branch === "HEAD") {
    console.log(`[pr-link] on ${branch || "detached HEAD"}, nothing to link`);
    return "";
  }
  const pr = await args.github.getOpenPrForBranch(branch);
  if (!pr) {
    if (args.dryRun) {
      console.log(`[dry-run] the agent would open a PR for branch ${branch} (none exists in dry-run)`);
    } else {
      console.log(`[pr-link] no open PR found for ${branch}; the agent owns PR creation`);
    }
    return "";
  }
  if (args.canBackfill && isThinPrBody(pr.body)) {
    try {
      const body = buildPrBody({
        commitSubjects: collectCommitSubjects(pr.baseRef),
        diffStat: collectDiffStat(pr.baseRef),
        issueNumber: args.issueNumber
      });
      await args.github.updatePullRequestBody(pr.number, body);
      console.log(`[pr-link] backfilled thin PR body for #${pr.number}`);
    } catch (e) {
      console.error("[pr-link] failed to backfill PR body:", e);
    }
  }
  return linkPr(args.github, pr.url, args.hasCookingComment, args.cookingCommentId);
}
async function linkPr(github, url, hasCookingComment, cookingCommentId) {
  setOutput("pr-url", url);
  console.log(`[pr-link] linking PR: ${url}`);
  if (hasCookingComment) {
    await appendPrToComment(github, cookingCommentId, url);
  } else {
    appendStepSummary(`### \uD83D\uDD00 Pull Request

${url}`);
    console.log("[pr-link] wrote PR link to job summary (direct mode)");
  }
  return url;
}
function hasUnpushedCommits(git, branch, onMain) {
  const upstream = gitTrim(git, "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}");
  if (upstream) {
    return gitCountNonZero(git, "git rev-list --count @{upstream}..HEAD");
  }
  if (!onMain && gitTrim(git, `git ls-remote --heads origin ${shellQuote(branch)}`)) {
    return gitCountNonZero(git, `git rev-list --count origin/${shellQuote(branch)}..HEAD`);
  }
  for (const base of ["origin/HEAD", "origin/main", "origin/master"]) {
    const n = gitTrim(git, `git rev-list --count ${base}..HEAD`);
    if (n !== "")
      return n !== "0";
  }
  return false;
}
function detectStoppedEarly(todos, enableGitOps, git = sh) {
  const incompleteTodos = Array.isArray(todos) && todos.some((t) => t?.status !== "completed");
  let dirtyTree = false;
  let unpushedCommits = false;
  if (enableGitOps) {
    try {
      dirtyTree = git("git status --porcelain").trim() !== "";
    } catch (e) {
      console.error("[stopped-early] git status failed:", e);
    }
    try {
      const branch = gitTrim(git, "git branch --show-current");
      const onMain = branch === "" || branch === "main" || branch === "master";
      unpushedCommits = hasUnpushedCommits(git, branch, onMain);
    } catch (e) {
      console.error("[stopped-early] unpushed-commits check failed:", e);
    }
  }
  const stoppedEarly = incompleteTodos || dirtyTree || unpushedCommits;
  if (stoppedEarly) {
    console.log(`[stopped-early] run did not finish cleanly (incompleteTodos=${incompleteTodos}, dirtyTree=${dirtyTree}, unpushedCommits=${unpushedCommits})`);
  }
  return stoppedEarly;
}
function collectDiffStat(baseRef, git = sh) {
  try {
    return git(`git diff --stat origin/${shellQuote(baseRef)}...HEAD`);
  } catch (e) {
    console.error("[runner] git diff --stat failed:", e);
    return "";
  }
}
function collectCommitSubjects(baseRef, git = sh) {
  try {
    return git(`git log origin/${shellQuote(baseRef)}..HEAD --format=%s`).split(`
`).map((line) => line.trim()).filter(Boolean);
  } catch (e) {
    console.error("[pr-link] git log failed:", e);
    return [];
  }
}
function sh(cmd) {
  return execFileSync("bash", ["-c", cmd], {
    encoding: "utf8",
    timeout: SH_TIMEOUT_MS,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
  });
}
function gitTrim(git, cmd) {
  try {
    return git(cmd).trim();
  } catch {
    return "";
  }
}
function gitCountNonZero(git, cmd) {
  const n = gitTrim(git, cmd);
  return n !== "" && n !== "0";
}
function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function appendStepSummary(markdown) {
  const file = process.env["GITHUB_STEP_SUMMARY"];
  if (!file) {
    console.log(`(would append step summary)
${markdown}`);
    return;
  }
  appendFileSync(file, `${markdown}
`);
}
async function appendPrToComment(github, commentId, prUrl) {
  const middle = `### Pull Request

${prUrl}`;
  try {
    await github.updateZone(commentId, "middle", middle);
  } catch (e) {
    console.error("[pr-link] failed to update comment with PR URL:", e);
  }
}
function setOutput(name, value) {
  const file = process.env["GITHUB_OUTPUT"];
  if (!file) {
    console.log(`(would set output) ${name}=${value}`);
    return;
  }
  if (value.includes(`
`)) {
    const eof = `_GHO_EOF_${Math.random().toString(36).slice(2)}`;
    appendFileSync(file, `${name}<<${eof}
${value}
${eof}
`);
  } else {
    appendFileSync(file, `${name}=${value}
`);
  }
}

// src/types.ts
function isAssistantMessage(msg) {
  return typeof msg === "object" && msg !== null && msg.role === "assistant";
}
function isToolMessage(msg) {
  return typeof msg === "object" && msg !== null && msg.role === "tool" && typeof msg.content === "string";
}
function isSessionStatsMessage(msg) {
  return typeof msg === "object" && msg !== null && msg.type === "session_stats";
}
var RESULT_PREFIX = "Result of tool call: ";
var FAILURE_PREFIX = "Tool execution failed:";
function parseInnerResult(content) {
  if (!content.startsWith(RESULT_PREFIX))
    return null;
  const json = content.slice(RESULT_PREFIX.length);
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
function isEnvelopeFailure(content) {
  return content.startsWith(FAILURE_PREFIX);
}
function envelopeFailureMessage(content) {
  if (!isEnvelopeFailure(content))
    return "";
  return content.slice(FAILURE_PREFIX.length).trim();
}

// src/transcript.ts
function extractTranscript(messages) {
  const usage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requests: 0,
    toolCalls: 0
  };
  const counts = {
    total: 0,
    perToolSuccess: {},
    perToolError: {}
  };
  const idToName = new Map;
  const perToolTotal = {};
  let latestCost;
  let finalResponse = "";
  for (const msg of messages) {
    if (isSessionStatsMessage(msg)) {
      const c = msg.cost;
      if (c) {
        const input = numeric(c.input);
        const output = numeric(c.output);
        const total = numeric(c.total) || input + output;
        if (input > 0 || output > 0 || total > 0) {
          latestCost = {
            input,
            output,
            total,
            currency: typeof c.currency === "string" && c.currency ? c.currency : "USD"
          };
        }
      }
      continue;
    }
    if (!isAssistantMessage(msg))
      continue;
    if (msg.tool_calls) {
      usage.toolCalls += msg.tool_calls.length;
      for (const call of msg.tool_calls) {
        if (call.id && call.function?.name) {
          idToName.set(call.id, call.function.name);
        }
        counts.total += 1;
        const name = call.function?.name || "unknown";
        perToolTotal[name] = (perToolTotal[name] ?? 0) + 1;
      }
    }
    if (typeof msg.content === "string") {
      const trimmed = msg.content.trim();
      if (trimmed)
        finalResponse = trimmed;
    }
    const tokens = msg.token_usage;
    if (tokens) {
      const prompt = numeric(tokens.prompt_tokens);
      const completion = numeric(tokens.completion_tokens);
      const total = numeric(tokens.total_tokens) || prompt + completion || 0;
      if (prompt !== 0 || completion !== 0 || total !== 0) {
        usage.promptTokens += prompt;
        usage.completionTokens += completion;
        usage.totalTokens += total;
        usage.requests += 1;
      }
    }
  }
  if (latestCost)
    usage.cost = latestCost;
  const failures = [];
  for (const msg of messages) {
    if (!isToolMessage(msg))
      continue;
    if (isEnvelopeFailure(msg.content)) {
      const name2 = resolveToolName(msg.tool_call_id, idToName, undefined);
      counts.perToolError[name2] = (counts.perToolError[name2] ?? 0) + 1;
      const errMsg2 = envelopeFailureMessage(msg.content);
      if (errMsg2)
        failures.push({ tool: name2, message: errMsg2 });
      continue;
    }
    const inner = parseInnerResult(msg.content);
    if (!inner || inner.success !== false)
      continue;
    const name = resolveToolName(msg.tool_call_id, idToName, inner.tool_name);
    counts.perToolError[name] = (counts.perToolError[name] ?? 0) + 1;
    const errMsg = pickErrorMessage(inner.error, inner.message);
    if (errMsg)
      failures.push({ tool: name, message: errMsg });
  }
  for (const [tool, total] of Object.entries(perToolTotal)) {
    const errCount = counts.perToolError[tool] ?? 0;
    counts.perToolSuccess[tool] = Math.max(0, total - errCount);
  }
  return { failures, usage, toolCallCounts: counts, finalResponse };
}
function resolveToolName(toolCallId, idToName, innerToolName) {
  if (innerToolName && innerToolName.trim())
    return innerToolName;
  if (toolCallId) {
    const mapped = idToName.get(toolCallId);
    if (mapped)
      return mapped;
  }
  return "unknown";
}
function pickErrorMessage(error, message) {
  if (typeof error === "string") {
    const t = error.trim();
    if (t)
      return t;
  }
  if (typeof message === "string") {
    const t = message.trim();
    if (t)
      return t;
  }
  return "";
}
function numeric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// src/report.ts
var MAX_RESPONSE_CHARS = 16000;
async function main() {
  const { dryRun, repo, enableGitOps, redactor, github } = bootEntry();
  const issueNumberStr = optional("INFER_ISSUE_NUMBER");
  const issueNumber = issueNumberStr ? Number.parseInt(issueNumberStr, 10) : 0;
  const cookingCommentIdStr = optional("INFER_COOKING_COMMENT_ID");
  const cookingCommentId = cookingCommentIdStr ? Number.parseInt(cookingCommentIdStr, 10) : 0;
  const hasCookingComment = Number.isFinite(cookingCommentId) && cookingCommentId > 0;
  const modelUsed = optional("INFER_MODEL_USED") || "(unknown)";
  const workflowUrl = optional("INFER_WORKFLOW_URL") || "";
  const actor = optional("INFER_ACTOR") || "(unknown)";
  const runAgentExitCode = optional("INFER_RUN_AGENT_EXIT_CODE");
  const runAgentDurationMs = optional("INFER_RUN_AGENT_DURATION_MS");
  const salvagedPrUrl = optional("INFER_SALVAGED_PR_URL");
  const salvaged = salvagedPrUrl !== "" || optional("INFER_SALVAGED") === "true";
  const status = finalizeStatus(runAgentExitCode, detectStoppedEarly(readTodos(), enableGitOps) || salvaged, cancelMarkerPresent());
  setOutput("exit-code", status.exitCode);
  setOutput("run-duration-ms", runAgentDurationMs || "0");
  setOutput("stopped-early", String(status.stoppedEarly));
  setOutput("timed-out", String(status.timedOut));
  setOutput("result", status.result);
  let prUrl = "";
  if (enableGitOps) {
    try {
      if (salvagedPrUrl) {
        prUrl = await linkPr(github, salvagedPrUrl, hasCookingComment, cookingCommentId);
      } else {
        const ctx = await loadContextOrFallback(process.env, github, {
          stepName: "report"
        });
        prUrl = await linkAgentPr({
          github,
          cookingCommentId,
          hasCookingComment,
          dryRun,
          canBackfill: ctx.kind === "issue" || ctx.kind === "direct",
          issueNumber: ctx.kind === "issue" ? ctx.issueNumber : undefined
        });
      }
    } catch (e) {
      console.error("[report] PR link failed:", e);
    }
  } else {
    console.log("[report] git operations disabled, skipping PR link");
  }
  const durationMs = runAgentDurationMs ? Number.parseFloat(runAgentDurationMs) : 0;
  const messages = await parseAgentOutput(AGENT_OUTPUT_PATH);
  const { usage, toolCallCounts, ...extracted } = extractTranscript(messages);
  const failures = extracted.failures.map((f) => ({
    tool: redactor.redact(f.tool),
    message: redactor.redact(f.message)
  }));
  const agentResponse = truncate(redactor.redact(extracted.finalResponse), MAX_RESPONSE_CHARS);
  const footer = buildFooter({
    exitCode: status.exitCode,
    modelUsed,
    workflowUrl: hasCookingComment ? "" : workflowUrl,
    durationMs,
    actor,
    stoppedEarly: status.stoppedEarly,
    timedOut: status.timedOut,
    salvaged,
    prUrl,
    agentResponse,
    failures,
    usage
  });
  setOutput("failed-count", String(failures.length));
  setOutput("total-count", String(usage.toolCalls));
  writeStepSummary(redactor.redact(footer));
  let patched = false;
  if (hasCookingComment) {
    try {
      await github.updateZone(cookingCommentId, "result", footer);
      console.log(`Updated comment #${cookingCommentId} on issue #${issueNumber}`);
      patched = true;
    } catch (e) {
      console.error(`PATCH failed for comment #${cookingCommentId}, falling back to POST:`, e);
    }
  }
  if (!patched && issueNumber > 0) {
    try {
      await github.createIssueComment(issueNumber, footer);
      console.log(`Posted fallback comment to issue #${issueNumber}`);
    } catch (e) {
      console.error("Fallback POST also failed; result is only in the workflow summary:", e);
    }
  } else if (!patched) {
    console.log("No issue/PR thread to post to; result is in the job summary only (direct mode).");
  }
  if (hasCookingComment) {
    try {
      await github.clearSpinner(cookingCommentId);
    } catch (e) {
      console.error(`Failed to clear spinner on comment #${cookingCommentId}:`, e);
    }
  }
  try {
    const otelConfig = loadOtelConfig(process.env);
    const telemetry = {
      usage,
      failures,
      toolCallCounts,
      exitCode: status.exitCode,
      modelUsed,
      durationMs,
      stoppedEarly: status.stoppedEarly,
      timedOut: status.timedOut,
      actor,
      repo,
      workflowUrl,
      runId: process.env["GITHUB_RUN_ID"] ?? "",
      sha: process.env["GITHUB_SHA"] ?? "",
      ref: process.env["GITHUB_REF"] ?? "",
      eventName: process.env["GITHUB_EVENT_NAME"] ?? "",
      issueNumber: issueNumberStr ?? "",
      prUrl
    };
    await exportTelemetry(otelConfig, telemetry, redactor, dryRun);
  } catch (e) {
    console.error("[otel] export failed (non-fatal):", e);
  }
  return 0;
}
function buildFooter(args) {
  const timedOut = args.timedOut === true;
  const failed = !timedOut && args.exitCode !== "0";
  const stoppedEarly = !failed && (args.stoppedEarly || timedOut);
  const statusIcon = failed ? "\u274C" : stoppedEarly ? "\u26A0\uFE0F" : "\u2705";
  const statusText = failed ? "Failed" : stoppedEarly ? "Stopped early" : "Success";
  const lines = [];
  lines.push(`## ${statusIcon} Infer Result: ${statusText}`);
  lines.push("");
  if (stoppedEarly) {
    lines.push(stoppedEarlyNote(timedOut, args.prUrl, args.salvaged === true));
    lines.push("");
  }
  if (args.agentResponse.trim()) {
    lines.push(args.agentResponse);
    lines.push("");
  }
  const metaParts = [
    `**Model:** \`${args.modelUsed}\``,
    `**Exit Code:** \`${args.exitCode}\``,
    `**Duration:** ${args.durationMs > 0 ? formatDuration(args.durationMs) : "-"}`
  ];
  if (args.workflowUrl) {
    metaParts.push(`[View Job](${args.workflowUrl})`);
  }
  lines.push(metaParts.join(" \xB7 "));
  if (args.usage.totalTokens > 0) {
    lines.push("");
    lines.push(formatUsage(args.usage));
    if (args.usage.cost) {
      lines.push("");
      lines.push(formatCost(args.usage.cost));
    }
  }
  if (args.usage.toolCalls > 0) {
    lines.push("");
    lines.push(formatToolCalls(args.usage.toolCalls, args.failures.length));
  }
  lines.push("");
  if (args.failures.length > 0) {
    lines.push(`<details><summary>\u26A0\uFE0F ${args.failures.length} failed tool call(s)</summary>`);
    lines.push("");
    for (const f of args.failures) {
      lines.push(`- **${f.tool}**: ${f.message}`);
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }
  lines.push(`*Triggered by ${args.actor} \xB7 [Infer Action](https://github.com/inference-gateway/infer-action)*`);
  return lines.join(`
`);
}
function stoppedEarlyNote(timedOut, prUrl, salvaged) {
  if (timedOut) {
    return prUrl ? "_The agent hit the job's time limit before finishing, so it was stopped to salvage its work. Its committed changes were pushed; the draft pull request is linked above._" : "_The agent hit the job's time limit before finishing and was stopped. No pull request was opened; any unpushed work was lost with the runner \u2014 check the workflow log for what was attempted and re-trigger to retry._";
  }
  if (salvaged) {
    return prUrl ? "_The agent finished without pushing its work. The runner salvaged it into the pull request linked above \u2014 review it and mark it ready, or close it if it is not useful._" : "_The agent finished without pushing its work. The runner salvaged it onto a pushed branch but did not open a pull request (one already existed for the branch, or the lookup failed) \u2014 check the workflow log for the branch name._";
  }
  return prUrl ? "_The agent stopped before finishing its plan, so some work may be incomplete. Its committed changes were pushed; the draft pull request is linked above \u2014 review what is missing before merging._" : "_The agent stopped before finishing its plan, so some work may be incomplete. It did not open a pull request; any unpushed work was lost with the runner \u2014 check the workflow log for what was attempted and re-trigger to retry._";
}
function formatUsage(usage) {
  const fmt = (n) => n.toLocaleString("en-US");
  const reqs = usage.requests === 1 ? "1 request" : `${usage.requests} requests`;
  return `**Tokens:** ${fmt(usage.promptTokens)} in \xB7 ${fmt(usage.completionTokens)} out \xB7 ${fmt(usage.totalTokens)} total (${reqs})`;
}
function formatToolCalls(total, failed) {
  const succeeded = Math.max(0, total - failed);
  const rate = total > 0 ? Math.round(succeeded / total * 100) : 0;
  return `**Tool calls:** ${total.toLocaleString("en-US")} total \xB7 ${rate}% success rate`;
}
function formatCost(cost) {
  const currency = cost.currency || "USD";
  return `**Cost:** ${formatMoney(cost.input, currency)} in \xB7 ${formatMoney(cost.output, currency)} out \xB7 ${formatMoney(cost.total, currency)} total`;
}
function formatMoney(amount, currency) {
  try {
    return amount.toLocaleString("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    });
  } catch {
    return `${amount.toFixed(4)} ${currency}`;
  }
}
function truncate(text, max) {
  if (text.length <= max)
    return text;
  return text.slice(0, max) + `

\u2026 (response truncated)`;
}
function writeStepSummary(content) {
  const file = process.env["GITHUB_STEP_SUMMARY"];
  if (!file) {
    console.log("(would write step summary)");
    console.log(content);
    return;
  }
  appendFileSync2(file, content + `
`);
}
function readTodos() {
  try {
    const parsed = JSON.parse(readFileSync2(TODOS_PATH, "utf8"));
    if (!Array.isArray(parsed))
      return [];
    return parsed.filter((t) => !!t && typeof t === "object");
  } catch {
    return [];
  }
}
if (import.meta.main) {
  main().then((code) => process.exit(code), (e) => {
    console.error("[report] uncaught error:", e);
    process.exit(1);
  });
}
export {
  formatToolCalls,
  formatMoney,
  formatCost,
  buildFooter
};

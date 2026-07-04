#!/usr/bin/env bun
// @bun

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
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "fs";

// src/pr-body.ts
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
    return existsSync(CANCEL_MARKER_PATH);
  } catch {
    return false;
  }
}
function shouldDumpTail(runAgentExitCode, cancelled) {
  return runAgentExitCode !== "0" || cancelled;
}
var NOT_SALVAGED = { pr: null, salvaged: false };
function recoveryContext(ctx) {
  if (ctx.kind === "issue") {
    return { kind: "issue", issueNumber: ctx.issueNumber };
  }
  if (ctx.kind === "direct")
    return { kind: "direct" };
  if (ctx.kind === "pull_request" && !ctx.isFork) {
    return { kind: "pr", headRef: ctx.headRef, baseRef: ctx.baseRef };
  }
  return { kind: "skip" };
}
async function recoverUnpushedWork(deps) {
  if (deps.context.kind === "skip")
    return NOT_SALVAGED;
  const git = deps.git ?? sh;
  let preserved = false;
  try {
    const branch = gitTrim(git, "git branch --show-current");
    const onMain = branch === "" || branch === "main" || branch === "master";
    const dirty = gitTrim(git, "git status --porcelain") !== "";
    const ahead = hasUnpushedCommits(git, branch, onMain);
    if (!dirty && !ahead) {
      console.log("[recover] nothing to recover (clean tree, nothing unpushed)");
      return NOT_SALVAGED;
    }
    const target = recoveryBranch(deps.context, branch, onMain, deps.runId);
    if (deps.dryRun) {
      const action = deps.context.kind === "pr" ? "push it" : "open a draft PR";
      console.log(`[dry-run] [recover] would recover work to ${target} and ${action}`);
      return NOT_SALVAGED;
    }
    let existingPr = null;
    let prLookupFailed = false;
    if (deps.context.kind !== "pr") {
      try {
        existingPr = await deps.github.getPrForBranch(target);
      } catch (e) {
        prLookupFailed = true;
        console.error(`[recover] PR lookup for ${target} failed; will push work but not open a PR:`, e);
      }
    }
    if (!dirty && existingPr && existingPr.state !== "open" && treeMatchesBase(git, existingPr.baseRef)) {
      console.log(`[recover] branch ${target} was already ${existingPr.merged ? "merged" : "closed"} as PR #${existingPr.number} and its tree matches origin/${existingPr.baseRef}; nothing to salvage`);
      return NOT_SALVAGED;
    }
    if (onMain && deps.context.kind !== "pr") {
      git(`git checkout -B ${shellQuote(target)}`);
      console.log(`[recover] was on ${branch || "detached HEAD"}; moved work to ${target}`);
    }
    let committed = false;
    if (dirty) {
      git("git add -A");
      const staged = gitTrim(git, "git diff --cached --name-only") !== "";
      if (staged) {
        git(`git commit -m ${shellQuote(recoveryCommitMessage(deps.context))}`);
        committed = true;
        console.log("[recover] committed recovered changes");
      } else {
        console.log("[recover] nothing staged after add -A; skipping commit");
      }
    }
    if (!committed && !ahead) {
      console.log("[recover] nothing new to push after staging; skipping");
      return NOT_SALVAGED;
    }
    try {
      pushWithRebaseFallback(git, target);
      console.log(`[recover] pushed ${target}`);
      preserved = true;
    } catch (e) {
      console.error(`[recover] push of ${target} failed after rebase retry; leaving local commits:`, e);
      return NOT_SALVAGED;
    }
    if (deps.context.kind === "pr")
      return { pr: null, salvaged: true };
    if (existingPr && existingPr.state === "open") {
      console.log(`[recover] PR already exists for ${target} (#${existingPr.number}); linking it`);
      return { pr: existingPr, salvaged: true };
    }
    if (existingPr) {
      console.log(`[recover] PR #${existingPr.number} for ${target} was already ${existingPr.merged ? "merged" : "closed"}; work pushed to ${target} but not opening a duplicate PR`);
      return { pr: null, salvaged: true };
    }
    if (prLookupFailed) {
      console.log(`[recover] work pushed to ${target}; skipping PR creation because the PR lookup failed (avoiding a possible duplicate)`);
      return { pr: null, salvaged: true };
    }
    const base = await resolveBase(deps);
    if (treeMatchesBase(git, base)) {
      console.log(`[recover] ${target} is tree-identical to origin/${base}; skipping PR creation`);
      return NOT_SALVAGED;
    }
    const issueNumber = deps.context.kind === "issue" ? deps.context.issueNumber : undefined;
    const created = await deps.github.createDraftPr({
      head: target,
      base,
      title: recoveryPrTitle(deps.context),
      body: buildPrBody({
        commitSubjects: collectCommitSubjects(base, git),
        diffStat: collectDiffStat(base, git),
        issueNumber,
        note: SALVAGE_PR_NOTE
      })
    });
    console.log(`[recover] opened DRAFT PR for ${target}: ${created.url}`);
    return { pr: created, salvaged: true };
  } catch (e) {
    console.error("[recover] failed, leaving tree as-is:", e);
    return { pr: null, salvaged: preserved };
  }
}
var SALVAGE_PR_NOTE = "_This draft PR was opened automatically by infer-action's salvage step: the run ended without the agent pushing its work or opening a pull request. Review the changes and mark the PR ready, or close it if it is not useful._";
function treeMatchesBase(git, baseRef) {
  try {
    git(`git diff --quiet origin/${shellQuote(baseRef)} HEAD`);
    return true;
  } catch {
    return false;
  }
}
function recoveryBranch(context, branch, onMain, runId) {
  if (context.kind === "pr")
    return context.headRef;
  if (!onMain)
    return branch;
  if (context.kind === "issue")
    return `fix/issue-${context.issueNumber}`;
  return runId ? `infer/auto-${runId}` : `infer/auto-${Date.now()}`;
}
function recoveryCommitMessage(context) {
  if (context.kind === "issue")
    return `fix: resolve #${context.issueNumber}`;
  if (context.kind === "pr")
    return "fix: recover uncommitted changes";
  return "chore: recover agent changes";
}
function recoveryPrTitle(context) {
  return context.kind === "issue" ? `fix: resolve #${context.issueNumber} (salvaged)` : "chore: salvage unpushed agent work";
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
async function resolveBase(deps) {
  try {
    const def = await deps.github.getDefaultBranch();
    if (def)
      return def;
  } catch (e) {
    console.error("[recover] getDefaultBranch failed, defaulting to main:", e);
  }
  return "main";
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
function dumpAgentTail(n, redact = (s) => s) {
  try {
    const text = readFileSync(AGENT_OUTPUT_PATH, "utf8");
    const lines = text.split(`
`).filter((l) => l.trim() !== "");
    const tail = lines.slice(-n);
    if (tail.length === 0)
      return;
    console.error("==========================================");
    console.error(`[recover] last ${tail.length} line(s) of agent activity before it stopped:`);
    console.error("------------------------------------------");
    for (const line of tail) {
      const capped = line.length > 2000 ? line.slice(0, 2000) + " \u2026" : line;
      console.error(redact(capped));
    }
    console.error("==========================================");
  } catch (e) {
    console.error("[recover] could not read agent transcript for breadcrumb:", e);
  }
}
function pushWithRebaseFallback(git, target) {
  const cmd = `git push -u origin ${shellQuote(target)}`;
  try {
    git(cmd);
    return;
  } catch (e) {
    const msg = e.message ?? String(e);
    if (!isNonFastForward(msg)) {
      throw e;
    }
    console.warn(`[recover] push of ${target} rejected (remote has diverged); rebasing and retrying`);
  }
  for (const base of [target, "main", "master"]) {
    try {
      git(`git pull --rebase --autostash origin ${shellQuote(base)}`);
      console.log(`[recover] rebased ${target} onto origin/${base}`);
      break;
    } catch (e) {
      console.error(`[recover] rebase onto origin/${base} failed; trying next fallback:`, e);
    }
  }
  git(`git push -u origin ${shellQuote(target)}`);
}
function isNonFastForward(stderr) {
  return stderr.includes("non-fast-forward") || stderr.includes("fetch first") || stderr.includes("stale info") || stderr.includes("remote ref updated");
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

// src/salvage.ts
async function main() {
  const enableGitOps = optional("INFER_ENABLE_GIT_OPERATIONS") !== "false";
  if (!enableGitOps) {
    console.log("[salvage] git operations disabled; nothing to salvage");
    return 0;
  }
  const { dryRun, redactor, github } = bootEntry();
  const runId = optional("GITHUB_RUN_ID");
  if (shouldDumpTail(optional("INFER_RUN_AGENT_EXIT_CODE"), cancelMarkerPresent())) {
    dumpAgentTail(40, redactor.redact);
  }
  const ctx = await loadContextOrFallback(process.env, github, {
    stepName: "salvage"
  });
  try {
    const recovered = await recoverUnpushedWork({
      github,
      dryRun,
      context: recoveryContext(ctx),
      runId
    });
    if (recovered.pr) {
      setOutput("pr-url", recovered.pr.url);
      console.log(`[salvage] draft PR ready: ${recovered.pr.url}`);
    }
    if (recovered.salvaged) {
      setOutput("salvaged", "true");
    } else if (!recovered.pr) {
      console.log("[salvage] nothing to salvage");
    }
  } catch (e) {
    console.error("[salvage] failed, leaving tree as-is:", e);
  }
  return 0;
}
if (import.meta.main) {
  main().then((code) => process.exit(code), (e) => {
    console.error("[salvage] uncaught error:", e);
    process.exit(1);
  });
}

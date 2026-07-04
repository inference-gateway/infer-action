#!/usr/bin/env bun
// @bun

// src/runner.ts
import { spawn } from "child_process";
import { createWriteStream, writeFileSync as writeFileSync2 } from "fs";
import { PassThrough } from "stream";

// src/bash-allow.ts
var GIT_WRITE_ALLOW = [
  "git add( .*)?",
  "git commit( .*)?",
  "git push( .*)?",
  "git checkout( .*)?",
  "git switch( .*)?",
  "git fetch( .*)?",
  "git restore( .*)?",
  "git reset( .*)?",
  "git stash( .*)?",
  "gh pr create( .*)?",
  "gh pr ready( .*)?"
];
function composeBashAllowAppend(enableGitOps, bashAllowAppend) {
  return [...enableGitOps ? GIT_WRITE_ALLOW : [], bashAllowAppend.trim()].filter(Boolean).join(",");
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

// src/log-mirror.ts
function planLogMirroring(env) {
  return {
    stdout: env["INFER_MIRROR_AGENT_LOGS"] === "true",
    stderr: true
  };
}

// src/parser.ts
import readline from "readline";
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

// src/prompts.gen.ts
var PROMPTS = {
  SYSTEM_DIRECT: `# Infer Agent (manual run)

You are running in CI from a manual dispatch. There is no GitHub issue or
pull request thread associated with this run - your task is the free-text
prompt below, and your result is captured in the workflow job summary.

The runner filesystem is ephemeral. Any change you do not commit and
push to a remote branch is lost when the job ends.

## Working style

Use TodoWrite to track your plan and update it as you make progress.
There is no issue/PR comment to mirror to; your progress is visible in the
job log and your final summary is posted to the job summary automatically.

If a tool call fails (an Edit that does not apply, a rejected command),
the change did NOT happen. Re-read the file, fix the call, and retry.
Never mark a todo completed - or claim success - based on a failed call.

To read a file in another repository, use \`gh api repos/<owner>/<repo>/contents/<path>\`,
\`gh repo view <owner>/<repo>\`, \`gh pr view\`, or \`gh issue view\` \u2014 tools that the CLI
already handles well. Reserve \`gh search code\` for when the file location is genuinely
unknown; note it is heavily rate-limited and should be used for at most one or two
queries.

When a CLI call fails and the error includes "unknown flag", the usage text printed
in the error message is the authoritative list of valid flags. Pick from those listed
flags instead of guessing another variant.

For questions or discussion (no code changes), just answer and stop -
skip the steps below. Your answer is your final output.

## Code changes

If you will make code changes, follow this order. Do NOT defer commits to
the end of the run.

NEVER commit on or push to \`main\`/\`master\` - branch protection rejects the
push and the work is stranded. All work happens on the working branch.

1. BEFORE any file edits, create and push a working branch off the default
   branch. Choose a short, descriptive kebab-case name:

       git checkout -B infer/<short-description>
       git push -u origin infer/<short-description>

   (for example \`infer/add-rate-limit-header\`). Do not call Edit/Write
   before this step succeeds - those edits will be lost. Before your first
   edit, confirm \`git branch --show-current\` does NOT report \`main\` or
   \`master\`.

2. AFTER each TodoWrite item you flip to "completed", validate then commit:

       <run the repo's checks and fix any failures>
       git add -A
       git commit -m "<type>(<scope>): <description>"
       git push origin infer/<short-description>

   Push your working branch by name - never \`main\`.

   Before committing, run the repository's own checks - lint, format,
   type-check, tests (e.g. \`npm run lint\`, \`npm test\`, \`task lint\` -
   whatever the repo provides) - and fix the failures. CI runs only AFTER
   this job ends, so you cannot fix it later. Do not batch commits. The job
   has a turn limit; if you defer commits, partial work is destroyed when
   the runner ends.

3. As soon as your FIRST commit is pushed, open the pull request as a DRAFT.
   Do this early - not at the end - so your work is preserved as a PR even if
   the run is cut off before you finish. Write the description to a file first
   with the Write tool (this avoids shell-quoting problems with multi-line
   text), then pass it with --body-file:

       <use the Write tool to write the PR description to /tmp/pr-body.md>

       gh pr create --draft \\
         --title "<type>(<scope>): <what changed>" \\
         --body-file /tmp/pr-body.md

   Write /tmp/pr-body.md from the actual diff. It must contain:

       ## Summary
       <2-4 sentences: what changed and why>

       ## Changes
       <bullet list of the notable changes>

   \`gh pr create\` targets the repository's default branch and takes the head
   from your current branch. A one-line body is NOT acceptable - the
   ## Summary and ## Changes sections are required. Keep pushing after each
   step (step 2) so the draft PR always reflects your latest work.

4. When ALL your work is committed and pushed and the repo's checks pass,
   mark the PR ready for review:

       gh pr ready

   Do NOT merge, close, edit, or review the PR. Never run \`gh pr merge\`,
   \`gh pr close\`, \`gh pr edit\`, or \`gh pr review\` - a human reviews and merges.
   If you run low on turns or context before finishing, stop starting new
   work, make sure everything is committed and pushed, and leave the PR as a
   draft for a human to pick up.

Use Conventional Commits: \`type(scope): description\` (feat, fix, docs,
style, refactor, test, chore).

## Before you finish

If you changed files, verify each of these and fix what fails before
ending the run:

1. \`git status\` - clean tree; commit and push anything left.
2. \`git status -sb\` - no "[ahead"; if shown, \`git push\`.
3. \`gh pr view\` - succeeds; if not, create the draft PR now (step 3).

Question-only runs skip this.

## Output

End with a one-sentence summary of what you changed (or what you found, if
no changes). Your summary and the run's result are posted to the workflow
job summary - you do not need to call any GitHub APIs to report.

## Environment

- \`gh\` CLI is authenticated via GITHUB_TOKEN.
- \`git\` is configured with the github-actions[bot] identity.
- Full file access to the checkout.
- The runner is ephemeral - unpushed commits are lost when the job ends.`,
  SYSTEM_ISSUE: `# GitHub Issue Agent

You are running in CI on issue #{{issueNumber}}.

The runner filesystem is ephemeral. Any change you do not commit and
push to a remote branch is lost when the job ends.

## Working style

Use TodoWrite to track your plan. Update it as you make progress - the
runner publishes your todos to the issue comment automatically, so you do
not need to comment on the issue yourself.

Your todos render as Markdown in that comment, where GitHub turns \`#123\`
into a link to issue/PR 123 and \`@name\` into a mention that pings a real
user. Only write \`#123\` or \`@name\` when you deliberately mean that exact
issue, PR, or person. For ordinary numbering or counts inside a todo, drop
the \`#\` - write "step 1", "3 of 5 files", "PR 96" - so you never link an
unrelated or non-existent ticket.

If a tool call fails (an Edit that does not apply, a rejected command),
the change did NOT happen. Re-read the file, fix the call, and retry.
Never mark a todo completed - or claim success - based on a failed call.

To read a file in another repository, use \`gh api repos/<owner>/<repo>/contents/<path>\`,
\`gh repo view <owner>/<repo>\`, \`gh pr view\`, or \`gh issue view\` \u2014 tools that the CLI
already handles well. Reserve \`gh search code\` for when the file location is genuinely
unknown; note it is heavily rate-limited and should be used for at most one or two
queries.

When a CLI call fails and the error includes "unknown flag", the usage text printed
in the error message is the authoritative list of valid flags. Pick from those listed
flags instead of guessing another variant.

For questions or discussion (no code changes), just answer and stop -
skip the steps below.

## Code changes

If you will make code changes, follow this order. Do NOT defer commits to
the end of the run.

NEVER commit on or push to \`main\`/\`master\` - branch protection rejects the
push and the work is stranded. All work happens on the working branch.

1. BEFORE any file edits, get onto the working branch. Do not call
   Edit/Write before this step succeeds - those edits will be lost.

   No existing work for this issue (no "Existing work for this issue"
   section in the task, and no \`fix/issue-{{issueNumber}}\` branch on the
   remote)? Create and push the branch now:

       git checkout -B fix/issue-{{issueNumber}}
       git push -u origin fix/issue-{{issueNumber}}

   Otherwise CONTINUE the existing work - check it out and build on top of
   it, do NOT reset it:

       gh pr checkout <number>                       # for a linked PR, or:
       git fetch origin fix/issue-{{issueNumber}} && git checkout fix/issue-{{issueNumber}}

   Never run \`git checkout -B\` against an existing branch - that throws away
   the prior commits. Already on another branch? Stay on it.

   Before your first edit, confirm \`git branch --show-current\` does NOT
   report \`main\` or \`master\`. If it does, go back and create the branch.

2. AFTER each TodoWrite item you flip to "completed", validate then commit:

       <run the repo's checks and fix any failures>
       git add -A
       git commit -m "<type>(<scope>): <description>"
       git push origin fix/issue-{{issueNumber}}

   (If step 1 put you on a different branch, push that branch by name
   instead - never \`main\`.)

   Before committing, run the repository's own checks - lint, format,
   type-check, tests (e.g. \`npm run lint\`, \`npm test\`, \`task lint\` -
   whatever the repo provides) - and fix the failures. CI runs only AFTER
   this job ends, so you cannot fix it later. Do not batch commits. The job
   has a turn limit; if you defer commits, partial work is destroyed when
   the runner ends.

3. As soon as your FIRST commit is pushed, make sure a DRAFT pull request
   exists. Open it now, early - not at the end - so your work is preserved
   as a PR even if the run is cut off before you finish. Write the
   description to a file first with the Write tool (this avoids
   shell-quoting problems with multi-line text), then pass it with
   --body-file:

       <use the Write tool to write the PR description to /tmp/pr-body.md>

       gh pr create --draft --base main --head fix/issue-{{issueNumber}} \\
         --title "<type>(<scope>): <what changed>" \\
         --body-file /tmp/pr-body.md

   If you continued an existing PR/branch (step 1), one is already open -
   just keep pushing to it; do NOT run \`gh pr create\` again (it errors when
   a PR already exists).

   Write /tmp/pr-body.md from the actual diff. It must contain:

       Resolves #{{issueNumber}}

       ## Summary
       <2-4 sentences: what changed and why>

       ## Changes
       <bullet list of the notable changes>

   A one-line body such as "Fixes #{{issueNumber}}" is NOT acceptable - the
   ## Summary and ## Changes sections are required. Keep pushing after each
   step (step 2) so the draft PR always reflects your latest work.

4. When ALL your work is committed and pushed and the repo's checks pass,
   mark the PR ready for review:

       gh pr ready

   Do NOT merge, close, edit, or review the PR. Never run \`gh pr merge\`,
   \`gh pr close\`, \`gh pr edit\`, or \`gh pr review\` - a human reviews and merges.
   If you run low on turns or context before finishing, stop starting new
   work, make sure everything is committed and pushed, and leave the PR as a
   draft for a human to pick up.

Use Conventional Commits: \`type(scope): description\` (feat, fix, docs,
style, refactor, test, chore).

## Before you finish

If you changed files, verify each of these and fix what fails before
ending the run:

1. \`git status\` - clean tree; commit and push anything left.
2. \`git status -sb\` - no "[ahead"; if shown, \`git push\`.
3. \`gh pr view\` - succeeds; if not, create the draft PR now (step 3).

Question-only runs skip this.

## Output

End with a one-sentence summary of what you changed (or what you found,
if no changes). Do not call any GitHub comment APIs - the runner posts
your result.

## Environment

- \`gh\` CLI is authenticated via GITHUB_TOKEN.
- \`git\` is configured with the github-actions[bot] identity.
- Full file access to the checkout.
- The runner is ephemeral - unpushed commits are lost when the job ends.`,
  SYSTEM_PR_FORK: `# GitHub PR Agent (view-only)

You are running in CI on PR #{{prNumber}}. The PR's head branch
\`{{headRef}}\` lives in a fork (\`{{headRepoFullName}}\`) and has
been fetched read-only for you to inspect.

## Working style

Use TodoWrite to track your plan. Update it as you make progress - the
runner publishes your todos to the PR comment automatically.

Your todos render as Markdown in that comment, where GitHub turns \`#123\`
into a link to issue/PR 123 and \`@name\` into a mention that pings a real
user. Only write \`#123\` or \`@name\` when you deliberately mean that exact
issue, PR, or person. For ordinary numbering or counts inside a todo, drop
the \`#\` - write "step 1", "3 of 5 files", "PR 96" - so you never link an
unrelated or non-existent ticket.

The user's latest ask is in the "Triggering comment" section of your task.
Address that ask directly.

To read a file in another repository, use \`gh api repos/<owner>/<repo>/contents/<path>\`,
\`gh repo view <owner>/<repo>\`, \`gh pr view\`, or \`gh issue view\` \u2014 tools that the CLI
already handles well. Reserve \`gh search code\` for when the file location is genuinely
unknown; note it is heavily rate-limited and should be used for at most one or two
queries.

When a CLI call fails and the error includes "unknown flag", the usage text printed
in the error message is the authoritative list of valid flags. Pick from those listed
flags instead of guessing another variant.

## You cannot commit or push

This PR's head lives in a fork. The runner does not have write access to
the fork's branch. DO NOT run \`git commit\`, \`git push\`,
\`gh pr create\`, \`gh pr merge\`, \`gh pr close\`, \`gh pr edit\`, or
\`gh pr review\`. Any attempt will fail.

Instead: read files, run \`git diff origin/{{baseRef}}...HEAD\`,
\`git log\`, and the repo's own checks (lint, tests) to investigate.
Answer the user's question or summarise findings.

## Output

End with a one-sentence summary of what you found. Do not call any
GitHub comment APIs - the runner posts your result.

## Environment

- \`gh\` CLI is authenticated via GITHUB_TOKEN (read access only on the
  fork's head branch).
- Full file access to the checkout, on a detached read-only copy of the
  fork's head.
- The runner is ephemeral.`,
  SYSTEM_PR: `# GitHub PR Agent

You are running in CI on PR #{{prNumber}}. The PR's head branch
\`{{headRef}}\` is already checked out for you.

The runner filesystem is ephemeral. Any change you do not commit and
push is lost when the job ends.

## Working style

Use TodoWrite to track your plan. Update it as you make progress - the
runner publishes your todos to the PR comment automatically, so you do
not need to comment on the PR yourself.

Your todos render as Markdown in that comment, where GitHub turns \`#123\`
into a link to issue/PR 123 and \`@name\` into a mention that pings a real
user. Only write \`#123\` or \`@name\` when you deliberately mean that exact
issue, PR, or person. For ordinary numbering or counts inside a todo, drop
the \`#\` - write "step 1", "3 of 5 files", "PR 96" - so you never link an
unrelated or non-existent ticket.

If a tool call fails (an Edit that does not apply, a rejected command),
the change did NOT happen. Re-read the file, fix the call, and retry.
Never mark a todo completed - or claim success - based on a failed call.

To read a file in another repository, use \`gh api repos/<owner>/<repo>/contents/<path>\`,
\`gh repo view <owner>/<repo>\`, \`gh pr view\`, or \`gh issue view\` \u2014 tools that the CLI
already handles well. Reserve \`gh search code\` for when the file location is genuinely
unknown; note it is heavily rate-limited and should be used for at most one or two
queries.

When a CLI call fails and the error includes "unknown flag", the usage text printed
in the error message is the authoritative list of valid flags. Pick from those listed
flags instead of guessing another variant.

The user's latest ask is in the "Triggering comment" section of your task.
Address that ask directly. Do NOT re-implement existing changes unless
the user is asking for that.

For questions or discussion (no code changes), just answer and stop -
skip the steps below.

## Code changes

If you will make code changes, follow this order. Do NOT defer commits
to the end of the run.

1. You are ALREADY on branch \`{{headRef}}\`. DO NOT create a new branch.
   DO NOT run \`git checkout -b\` or \`git checkout -B\`. Verify with
   \`git rev-parse --abbrev-ref HEAD\` if uncertain - it must report
   \`{{headRef}}\`.

2. AFTER each TodoWrite item you flip to "completed", validate then commit:

       <run the repo's checks and fix any failures>
       git add -A
       git commit -m "<type>(<scope>): <description>"
       git push

   Before committing, run the repository's own checks - lint, format,
   type-check, tests (e.g. \`npm run lint\`, \`npm test\`, \`task lint\` -
   whatever the repo provides) - and fix the failures. CI runs only AFTER
   this job ends, so you cannot fix it later. Do not batch commits. The
   job has a turn limit; if you defer commits, partial work is destroyed
   when the runner ends.

3. The pull request ALREADY EXISTS (PR #{{prNumber}}). DO NOT run
   \`gh pr create\`. DO NOT run \`gh pr merge\`, \`gh pr close\`,
   \`gh pr edit\`, or \`gh pr review\`. Your pushes to \`{{headRef}}\`
   update the existing PR automatically. If you run low on turns or
   context before finishing, stop starting new work and make sure
   everything is committed and pushed - your pushes are the PR.

Use Conventional Commits: \`type(scope): description\` (feat, fix, docs,
style, refactor, test, chore).

Before you finish, if you changed files: \`git status\` must be clean and
\`git status -sb\` must show no "[ahead" - commit and push anything left.

## Output

End with a one-sentence summary of what you changed (or what you found,
if no changes). Do not call any GitHub comment APIs - the runner posts
your result.

## Environment

- \`gh\` CLI is authenticated via GITHUB_TOKEN.
- \`git\` is configured with the github-actions[bot] identity.
- Full file access to the checkout, already on the PR head branch.
- The runner is ephemeral - unpushed commits are lost when the job ends.`,
  TASK_DIRECT: `Complete the following task in this repository. It was dispatched manually; there is no associated GitHub issue or pull request to reply to.

{{prompt}}`,
  TASK_ISSUE: `Resolve the following GitHub issue:

Issue #{{issueNumber}}: {{issueTitle}}

{{issueBody}}{{existingWorkSection}}{{triggeringCommentSection}}`,
  TASK_PR: `Continue work on the following pull request.

PR #{{prNumber}}: {{prTitle}}
Head branch: {{headRef}} (base: {{baseRef}}){{forkNotice}}

## Description

{{prBody}}{{otherCommentsSection}}

## Changed files

{{diffStatSection}}

Run \`git diff origin/{{baseRef}}...HEAD\` for the full diff and \`git log origin/{{baseRef}}..HEAD\` for the commit history.{{triggerSection}}`
};

// src/prompts.ts
function templateFor(key) {
  const override = process.env[`INFER_PROMPT_OVERRIDE_${key}`];
  return override && override.trim() ? override : PROMPTS[key];
}
function overrideFor(key) {
  const v = process.env[`INFER_PROMPT_OVERRIDE_${key}`];
  return v && v.trim() ? v : null;
}
var GIT_SAFETY_MARKERS = {
  SYSTEM_ISSUE: [
    "git commit",
    "git push",
    "gh pr create",
    "gh pr ready",
    "git status"
  ],
  SYSTEM_DIRECT: [
    "git commit",
    "git push",
    "gh pr create",
    "gh pr ready",
    "git status"
  ],
  SYSTEM_PR: ["git commit", "git push", "git status"],
  SYSTEM_PR_FORK: ["git commit", "git push"]
};
function systemPromptKeyFor(ctx) {
  if (ctx.kind === "issue")
    return "SYSTEM_ISSUE";
  if (ctx.kind === "direct")
    return "SYSTEM_DIRECT";
  if (ctx.isFork)
    return "SYSTEM_PR_FORK";
  return "SYSTEM_PR";
}
function systemPromptOverrideWarnings(ctx) {
  const key = systemPromptKeyFor(ctx);
  const override = overrideFor(key);
  if (override === null)
    return [];
  const markers = GIT_SAFETY_MARKERS[key];
  if (!markers || markers.length === 0)
    return [];
  const missing = markers.filter((m) => !override.includes(m));
  return missing.length > 0 ? [{ key, missing }] : [];
}
function render(key, vars = {}) {
  return templateFor(key).replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (!(name in vars)) {
      throw new Error(`Missing variable "${name}" for prompt "${key}"`);
    }
    return String(vars[name]);
  });
}
function buildTask(ctx, opts = {}) {
  if (ctx.kind === "issue")
    return buildIssueTask(ctx);
  if (ctx.kind === "direct")
    return buildDirectTask(ctx);
  return buildPullRequestTask(ctx, opts.diffStat ?? "");
}
function buildSystemPrompt(ctx, customInstructions) {
  const base = renderSystemPrompt(ctx);
  if (customInstructions.trim()) {
    return `${base}

## Additional Instructions

${customInstructions}`;
  }
  return base;
}
function renderSystemPrompt(ctx) {
  if (ctx.kind === "issue") {
    return render("SYSTEM_ISSUE", { issueNumber: ctx.issueNumber });
  }
  if (ctx.kind === "direct") {
    return render("SYSTEM_DIRECT");
  }
  if (ctx.isFork) {
    return render("SYSTEM_PR_FORK", {
      prNumber: ctx.prNumber,
      headRef: ctx.headRef,
      headRepoFullName: ctx.headRepoFullName,
      baseRef: ctx.baseRef
    });
  }
  return render("SYSTEM_PR", {
    prNumber: ctx.prNumber,
    headRef: ctx.headRef
  });
}
function buildDirectTask(ctx) {
  return render("TASK_DIRECT", { prompt: ctx.prompt });
}
function buildIssueTask(ctx) {
  const triggeringCommentSection = ctx.triggeringComment ? `

## Triggering comment from @${ctx.triggeringComment.author}

${ctx.triggeringComment.body}

Treat this comment as the user's most recent intent. If it asks for something more specific than the issue body, prioritise it.` : "";
  return render("TASK_ISSUE", {
    issueNumber: ctx.issueNumber,
    issueTitle: ctx.issueTitle,
    issueBody: ctx.issueBody,
    existingWorkSection: buildExistingWorkSection(ctx),
    triggeringCommentSection
  });
}
function buildExistingWorkSection(ctx) {
  const prs = ctx.associatedPrs ?? [];
  const branches = ctx.associatedBranches ?? [];
  if (prs.length === 0 && branches.length === 0)
    return "";
  const parts = [
    "## Existing work for this issue",
    "A prior run or another contributor may already have started on this issue. " + "Before creating a branch, inspect the items below and CONTINUE from them if " + "they contain relevant work - check it out (`gh pr checkout <number>`, or " + "`git fetch origin <branch> && git checkout <branch>`) and build on top of it " + "rather than starting fresh. Only start a new branch if none of these apply."
  ];
  if (prs.length) {
    const lines = prs.map((p) => {
      const draft = p.isDraft ? " (draft)" : "";
      const state = p.state && p.state !== "open" ? ` [${p.state}]` : "";
      const branch = p.headRef ? ` - branch \`${p.headRef}\`` : "";
      const title = p.title ? ` - ${p.title}` : "";
      return `- PR #${p.number}${draft}${state}${branch}: ${p.url}${title}`;
    });
    parts.push(`### Pull requests

` + lines.join(`
`));
  }
  if (branches.length) {
    parts.push(`### Branches

` + branches.map((b) => `- \`${b}\``).join(`
`));
  }
  return `

` + parts.join(`

`);
}
function buildPullRequestTask(ctx, diffStat) {
  const forkNotice = ctx.isFork ? `
Head lives in a fork: ${ctx.headRepoFullName}. You CANNOT push commits to it from this runner.` : "";
  const trigger = ctx.comments.find((c) => c.isTrigger);
  const triggerSection = trigger ? `

## Triggering comment from @${trigger.author} (id: ${trigger.id})

${trigger.body}

This is the user's most recent ask. Address it directly. Do not re-implement existing changes unless this comment asks for that.` : "";
  const others = ctx.comments.filter((c) => !c.isTrigger);
  const otherCommentsSection = others.length > 0 ? `

## Other comments (chronological)

${others.map(renderComment).join(`

`)}` : "";
  const prBody = ctx.prBody.trim() ? ctx.prBody : "_(no description)_";
  const diffStatSection = diffStat.trim() ? "```\n" + diffStat.trim() + "\n```" : "_(no changes on this branch yet)_";
  return render("TASK_PR", {
    prNumber: ctx.prNumber,
    prTitle: ctx.prTitle,
    headRef: ctx.headRef,
    baseRef: ctx.baseRef,
    forkNotice,
    prBody,
    triggerSection,
    otherCommentsSection,
    diffStatSection
  });
}
function renderComment(c) {
  return `**@${c.author}** \xB7 ${c.createdAt}

${c.body}`;
}

// src/reminders.ts
var CONTEXT_INTERVAL = 5;
var WRAP_UP_THRESHOLD = 10;
function composeReminders(ctx, opts) {
  const entries = [];
  const writable = opts.enableGitOps && !(ctx.kind === "pull_request" && ctx.isFork);
  entries.push({
    name: "infer-action-context",
    hook: "pre_stream",
    trigger: "interval",
    interval: CONTEXT_INTERVAL,
    text: opts.enableGitOps ? contextReminderText(ctx) : "<system-reminder>Keep your TodoWrite plan current as you go. Only answering a question? Ignore this.</system-reminder>"
  });
  if (writable) {
    entries.push({
      name: "infer-action-wrap-up",
      hook: "pre_stream",
      trigger: "turns_before_max",
      threshold: WRAP_UP_THRESHOLD,
      text: wrapUpText(ctx)
    });
    entries.push({
      name: "infer-action-failed-tool",
      hook: "post_tool",
      trigger: "on_failure",
      text: failedToolText()
    });
  }
  return entries;
}
function contextReminderText(ctx) {
  if (ctx.kind === "pull_request" && ctx.isFork) {
    return "<system-reminder>This PR is from a fork - you CANNOT commit or push. Investigate with file reads and git diff, then answer the user's question or summarise. Keep your TodoWrite plan current.</system-reminder>";
  }
  if (ctx.kind === "pull_request") {
    return `<system-reminder>Keep your TodoWrite plan current, and commit + push after each step so PR #${ctx.prNumber} stays current - unpushed work is lost when the job ends.</system-reminder>`;
  }
  return "<system-reminder>Keep your TodoWrite plan current. Changing code? Work on a pushed branch with an open draft PR (`gh pr create --draft`) and commit + push after each step so nothing is lost - never commit on or push to main. Only answering a question? Ignore this.</system-reminder>";
}
function wrapUpText(ctx) {
  const target = ctx.kind === "pull_request" ? `so PR #${ctx.prNumber} is up to date` : "and make sure the draft PR exists (`gh pr create --draft`)";
  return `<system-reminder>You are close to the turn limit. Stop starting new work - commit and push everything now ${target}. Unpushed work is lost when the run ends.</system-reminder>`;
}
function failedToolText() {
  return "<system-reminder>That tool call FAILED - the change did NOT happen. " + "Re-read or re-check, fix it, and retry. Never mark a todo done or claim " + "success on a failed call.</system-reminder>";
}
function renderRemindersYaml(entries) {
  const lines = ["enabled: true", "merge: true", "reminders:"];
  for (const e of entries) {
    lines.push(`  - name: ${JSON.stringify(e.name)}`);
    lines.push(`    hook: ${JSON.stringify(e.hook)}`);
    lines.push(`    trigger: ${JSON.stringify(e.trigger)}`);
    if (e.interval !== undefined)
      lines.push(`    interval: ${e.interval}`);
    if (e.threshold !== undefined)
      lines.push(`    threshold: ${e.threshold}`);
    lines.push(`    text: ${JSON.stringify(e.text)}`);
  }
  return lines.join(`
`) + `
`;
}
function resolveRemindersYaml(remindersConfig, ctx, opts) {
  const verbatim = remindersConfig.trim();
  if (verbatim)
    return verbatim.endsWith(`
`) ? verbatim : verbatim + `
`;
  return renderRemindersYaml(composeReminders(ctx, opts));
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
var SH_TIMEOUT_MS = 60000;
function writeCancelMarker() {
  try {
    writeFileSync(CANCEL_MARKER_PATH, "1");
  } catch (e) {
    console.error("[runner] failed to write cancel marker:", e);
  }
}
function clearCancelMarker() {
  try {
    rmSync(CANCEL_MARKER_PATH, { force: true });
  } catch {}
}
function collectDiffStat(baseRef, git = sh) {
  try {
    return git(`git diff --stat origin/${shellQuote(baseRef)}...HEAD`);
  } catch (e) {
    console.error("[runner] git diff --stat failed:", e);
    return "";
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
function sh(cmd) {
  return execFileSync("bash", ["-c", cmd], {
    encoding: "utf8",
    timeout: SH_TIMEOUT_MS,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
  });
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

// src/types.ts
function isToolMessage(msg) {
  return typeof msg === "object" && msg !== null && msg.role === "tool" && typeof msg.content === "string";
}
function isCompactionMessage(msg) {
  if (typeof msg !== "object" || msg === null)
    return false;
  const type = msg.type;
  return type === "compaction_started" || type === "compaction_completed";
}
var RESULT_PREFIX = "Result of tool call: ";
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

// src/ticker.ts
class Ticker {
  handlers = new Map;
  flushers = [];
  listeners = [];
  on(toolName, handler) {
    this.handlers.set(toolName, handler);
    return this;
  }
  onMessage(listener) {
    this.listeners.push(listener);
    return this;
  }
  addFlusher(flusher) {
    this.flushers.push(flusher);
    return this;
  }
  async observe(messages) {
    for await (const msg of messages) {
      for (const listener of this.listeners) {
        try {
          listener(msg);
        } catch (e) {
          console.error("[ticker] message listener threw:", e);
        }
      }
      if (!isToolMessage(msg))
        continue;
      const inner = parseInnerResult(msg.content);
      if (!inner?.tool_name)
        continue;
      const handler = this.handlers.get(inner.tool_name);
      if (!handler)
        continue;
      try {
        await handler(inner, msg);
      } catch (e) {
        console.error(`[ticker] handler for ${inner.tool_name} threw:`, e);
      }
    }
  }
  async flush() {
    for (const flusher of this.flushers) {
      try {
        await flusher();
      } catch (e) {
        console.error("[ticker] flusher threw:", e);
      }
    }
  }
}
function throttleLatest(fn, delayMs) {
  let latest = null;
  let timer = null;
  let inFlight = null;
  const fire = async () => {
    timer = null;
    if (!latest)
      return;
    const value = latest.value;
    latest = null;
    inFlight = fn(value).catch((e) => {
      console.error("[throttle] fn threw:", e);
    }).finally(() => {
      inFlight = null;
    });
    await inFlight;
  };
  return {
    call(value) {
      latest = { value };
      if (!timer) {
        timer = setTimeout(() => {
          fire();
        }, delayMs);
      }
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (latest) {
        await fire();
      } else if (inFlight) {
        await inFlight;
      }
    }
  };
}

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

// src/runner.ts
var TICKER_DEBOUNCE_MS = 1500;
async function main() {
  const { dryRun, enableGitOps, redactor, github } = bootEntry();
  const cookingCommentIdRaw = optional("INFER_COOKING_COMMENT_ID");
  const cookingCommentId = cookingCommentIdRaw ? Number.parseInt(cookingCommentIdRaw, 10) : 0;
  const hasCookingComment = Number.isFinite(cookingCommentId) && cookingCommentId > 0;
  const workflowUrl = optional("INFER_WORKFLOW_URL");
  const model = required("INFER_AGENT_MODEL");
  const customInstructions = optional("INFER_CUSTOM_INSTRUCTIONS");
  const extraBashAllow = optional("INFER_BASH_ALLOW_APPEND");
  const debugEvents = optional("INFER_LOGGING_DEBUG") === "true";
  const mirror = planLogMirroring(process.env);
  const ctx = await loadContextOrFallback(process.env, github, {
    stepName: "dry-run",
    failHard: !dryRun
  });
  if (ctx.kind === "pull_request" && enableGitOps) {
    ensurePrHeadCheckedOut(ctx);
  }
  const diffStat = ctx.kind === "pull_request" ? collectDiffStat(ctx.baseRef) : "";
  const systemPrompt = buildSystemPrompt(ctx, customInstructions);
  const task = buildTask(ctx, { diffStat });
  if (enableGitOps) {
    for (const d of systemPromptOverrideWarnings(ctx)) {
      const slug = d.key.replace(/^SYSTEM_/, "").toLowerCase().replace(/_/g, "-");
      process.stdout.write(`::warning::INFER_PROMPT_OVERRIDE_${d.key} replaces the bundled system ` + `prompt (system-prompt-${slug} / src/prompts/system-${slug}.md) and is ` + `missing the git-safety markers: ${d.missing.join(", ")}. The default ` + `guards against lost work (branch-first, commit-per-todo, push, draft ` + `PR, finish checklist); your override dropped those instructions, so ` + `the agent may leave changes uncommitted or unpushed. Re-add them to ` + `your override, or use the custom-instructions input to layer extras ` + `on top of the default instead of replacing it.
`);
    }
  }
  const remindersConfig = optional("INFER_REMINDERS_CONFIG");
  const remindersYaml = resolveRemindersYaml(remindersConfig, ctx, {
    enableGitOps
  });
  const bashAllowAppend = composeBashAllowAppend(enableGitOps, extraBashAllow);
  const inferBin = optional("INFER_BIN") || "infer";
  console.log("==========================================");
  console.log("SYSTEM PROMPT:");
  console.log("==========================================");
  console.log(systemPrompt);
  console.log("==========================================");
  console.log("");
  console.log("Running agent with task:");
  console.log(task);
  console.log("---");
  if (dryRun) {
    console.log("==========================================");
    console.log("DRY RUN - the agent would be invoked with:");
    console.log("==========================================");
    console.log(`Model:        ${model}`);
    console.log(`Context kind: ${ctx.kind}`);
    console.log(`Git ops:      ${enableGitOps ? "enabled" : "disabled"}`);
    console.log(`INFER_BIN:    ${inferBin}`);
    console.log("--- REMINDERS (INFER_REMINDERS_CONFIG) ---");
    console.log(remindersYaml);
    console.log("--- BASH ALLOW-LIST APPEND (added to the CLI read-only baseline) ---");
    console.log(bashAllowAppend || "(none - CLI read-only baseline only)");
    console.log("==========================================");
  }
  const childEnv = {
    ...process.env,
    INFER_AGENT_SYSTEM_PROMPT: systemPrompt,
    INFER_TOOLS_BASH_ALLOW_APPEND: bashAllowAppend,
    INFER_REMINDERS_CONFIG: remindersYaml
  };
  clearTodos();
  clearCancelMarker();
  const agentStartTime = Date.now();
  const child = spawn(inferBin, ["agent", "-m", model, task], {
    stdio: ["inherit", "pipe", "pipe"],
    env: childEnv
  });
  if (!child.stdout || !child.stderr) {
    throw new Error("child stdio not piped - this should not happen");
  }
  let cancelledBySignal = false;
  let signalHandled = false;
  const onSignal = (sig) => {
    if (signalHandled)
      return;
    signalHandled = true;
    cancelledBySignal = true;
    writeCancelMarker();
    console.error(`[runner] received ${sig}; stopping the agent so the salvage step can recover its work`);
    try {
      child.kill("SIGKILL");
    } catch (e) {
      console.error("[runner] failed to stop agent child:", e);
    }
  };
  process.once("SIGTERM", () => onSignal("SIGTERM"));
  process.once("SIGINT", () => onSignal("SIGINT"));
  const fileTee = createWriteStream(AGENT_OUTPUT_PATH);
  const lineFeed = new PassThrough;
  child.stdout.pipe(fileTee, { end: false });
  if (mirror.stdout) {
    child.stdout.pipe(process.stdout, { end: false });
  } else {
    console.log("[runner] agent stdout muted (set INFER_MIRROR_AGENT_LOGS=true to mirror); stderr still shown, full transcript written to /tmp/agent-output.txt");
  }
  child.stdout.pipe(lineFeed);
  child.stdout.on("end", () => fileTee.end());
  child.stderr.on("data", (chunk) => {
    fileTee.write(chunk);
    if (mirror.stderr) {
      process.stderr.write(chunk);
    }
  });
  const ticker = new Ticker;
  const throttledTodos = hasCookingComment ? throttleLatest(async (todos) => {
    const markdown = renderPlan(todos, workflowUrl, model);
    try {
      await github.updateZone(cookingCommentId, "plan", markdown);
      console.log(`[ticker] updated plan section (${todos.length} todos)`);
    } catch (e) {
      console.error("[ticker] PATCH failed:", e);
    }
  }, TICKER_DEBOUNCE_MS) : null;
  if (throttledTodos) {
    ticker.addFlusher(throttledTodos.flush);
  } else {
    console.log("[ticker] no cooking comment; plan mirroring disabled (direct mode)");
  }
  ticker.on("TodoWrite", (inner) => {
    const todos = inner.data?.todos;
    if (!Array.isArray(todos))
      return;
    persistTodos(todos);
    if (throttledTodos)
      throttledTodos.call(todos);
  });
  if (debugEvents) {
    ticker.onMessage((msg) => {
      if (isCompactionMessage(msg)) {
        console.log(msg.type === "compaction_started" ? "[agent] context compaction started (summarising older turns)\u2026" : "[agent] context compaction completed");
        return;
      }
      const m = msg;
      if (m.role === "user" && m.hidden === true && m.kind === "system_reminder") {
        console.log("[agent] system reminder injected");
      }
    });
  }
  await ticker.observe(readJsonLines(lineFeed));
  await ticker.flush();
  const exitCode = await waitForExit(child);
  const durationMs = Date.now() - agentStartTime;
  console.log("");
  console.log("==========================================");
  console.log(`Agent exited with code ${exitCode}`);
  console.log(`Duration: ${formatDuration(durationMs)}`);
  console.log("==========================================");
  if (cancelledBySignal) {
    setOutput("run-duration-ms", String(durationMs));
    await flushFileTee(fileTee);
    dumpAgentTail(40, redactor.redact);
    console.error("[runner] cancelled mid-run; the salvage step will recover any work and report the timeout");
    return 130;
  }
  setOutput("exit-code", String(exitCode));
  setOutput("run-duration-ms", String(durationMs));
  setOutput("result", exitCode === 0 ? "Agent completed successfully" : `Agent failed with exit code ${exitCode}`);
  return exitCode;
}
function renderHeader(workflowUrl, model) {
  const metaParts = [`**Model:** \`${model}\``];
  if (workflowUrl)
    metaParts.push(`[View Job](${workflowUrl})`);
  return `${SPINNER_BLOCK}

${metaParts.join(" \xB7 ")}`;
}
function renderPlan(todos, workflowUrl, model) {
  const header = renderHeader(workflowUrl, model);
  if (todos.length === 0) {
    return `${header}

### Todos

_(agent has not posted a plan yet)_`;
  }
  const lines = todos.map((t) => {
    const checkbox = t.status === "completed" ? "[x]" : t.status === "in_progress" ? "[~]" : "[ ]";
    return `- ${checkbox} ${t.content}`;
  });
  return [header, "", "### Todos", "", ...lines].join(`
`);
}
function ensurePrHeadCheckedOut(ctx) {
  try {
    if (ctx.isFork) {
      const localBranch = `pr-${ctx.prNumber}`;
      console.log(`[runner] fork PR; fetching pull/${ctx.prNumber}/head into ${localBranch}`);
      sh(`git fetch origin pull/${ctx.prNumber}/head:${localBranch}`);
      sh(`git checkout ${localBranch}`);
    } else {
      console.log(`[runner] checking out PR head branch ${ctx.headRef}`);
      sh(`git fetch origin ${ctx.headRef}`);
      sh(`git checkout ${ctx.headRef}`);
    }
  } catch (e) {
    throw new Error(`Failed to check out PR head (${ctx.headRef}). Aborting before spawning the agent so it doesn't run against the wrong branch.`, { cause: e });
  }
}
async function waitForExit(child) {
  if (child.exitCode !== null)
    return child.exitCode;
  return new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
  });
}
async function flushFileTee(stream) {
  if (stream.writableFinished)
    return;
  await Promise.race([
    new Promise((resolve) => stream.once("finish", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000).unref())
  ]);
}
function persistTodos(todos) {
  try {
    writeFileSync2(TODOS_PATH, JSON.stringify(todos));
  } catch (e) {
    console.error("[runner] failed to persist todos:", e);
  }
}
function clearTodos() {
  try {
    writeFileSync2(TODOS_PATH, "[]");
  } catch {}
}
if (import.meta.main) {
  main().then((code) => process.exit(code), (e) => {
    console.error("[runner] uncaught error:", e);
    process.exit(1);
  });
}
export {
  renderPlan
};

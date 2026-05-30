#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, createWriteStream } from "node:fs";
import { PassThrough } from "node:stream";
import type { PullRequestContext } from "./context.js";
import { loadContext } from "./context.js";
import { GithubClient, SPINNER_BLOCK } from "./github.js";
import { readJsonLines } from "./parser.js";
import { buildReminder, buildSystemPrompt, buildTask } from "./prompts.js";
import {
  collectSecretValues,
  createRedactor,
  emitAddMaskDirectives,
  SECRET_ENV_NAMES,
} from "./redact.js";
import { Ticker, throttleLatest } from "./ticker.js";
import type { InnerToolResult, Todo } from "./types.js";

const AGENT_OUTPUT_PATH = "/tmp/agent-output.txt";
const TICKER_DEBOUNCE_MS = 1500;
const DEFAULT_WHITELIST_COMMANDS =
  "git,ls,cd,mkdir,pwd,cat,echo,touch,cp,mv,find,grep,head,tail,wc,which,sed,awk,sort,uniq";
const DEFAULT_WHITELIST_PATTERNS = [
  "^git .*",
  "^gh pr (create|view|list|diff|checks|status)( .*)?$",
  "^gh issue (view|list)( .*)?$",
  "^gh (repo|run|release|workflow) (view|list)( .*)?$",
  "^gh auth status",
].join(",");
const DEFAULT_WEB_FETCH_DOMAINS = "github.com,raw.githubusercontent.com";

async function main(): Promise<number> {
  const token = required("GITHUB_TOKEN");
  const repo = required("INFER_REPO");
  const cookingCommentId = Number.parseInt(
    required("INFER_COOKING_COMMENT_ID"),
    10,
  );
  const model = required("INFER_AGENT_MODEL");
  const customInstructions = optional("INFER_CUSTOM_INSTRUCTIONS");
  const enableGitOps = optional("INFER_ENABLE_GIT_OPERATIONS") !== "false";
  const overrideWhitelistCommands = optional("INFER_BASH_WHITELIST_COMMANDS");
  const overrideWhitelistPatterns = optional("INFER_BASH_WHITELIST_PATTERNS");
  const appendWhitelistCommands = optional(
    "INFER_BASH_WHITELIST_COMMANDS_APPEND",
  );
  const appendWhitelistPatterns = optional(
    "INFER_BASH_WHITELIST_PATTERNS_APPEND",
  );
  const overrideWebFetchDomains = optional("INFER_WEB_FETCH_DOMAINS");
  const appendWebFetchDomains = optional("INFER_WEB_FETCH_DOMAINS_APPEND");
  const enableHeuristics = optional("INFER_REDACT_HEURISTICS") === "true";

  const secretValues = collectSecretValues(process.env, SECRET_ENV_NAMES);
  emitAddMaskDirectives(secretValues);
  const redactor = createRedactor({
    env: process.env,
    heuristics: enableHeuristics,
  });

  const github = new GithubClient({ token, repo, redactor });
  const ctx = await loadContext(process.env, github);

  if (ctx.kind === "pull_request" && enableGitOps) {
    ensurePrHeadCheckedOut(ctx);
  }

  const diffStat =
    ctx.kind === "pull_request" ? collectDiffStat(ctx.baseRef) : "";

  const systemPrompt = buildSystemPrompt(ctx, customInstructions);
  const task = buildTask(ctx, { diffStat });

  console.log("==========================================");
  console.log("SYSTEM PROMPT:");
  console.log("==========================================");
  console.log(systemPrompt);
  console.log("==========================================");
  console.log("");
  console.log("Running agent with task:");
  console.log(task);
  console.log("---");

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    INFER_AGENT_SYSTEM_PROMPT: systemPrompt,
    INFER_PROMPTS_AGENT_SYSTEM_REMINDERS_REMINDER_TEXT: buildReminder(ctx),
    INFER_TOOLS_BASH_WHITELIST_COMMANDS: buildWhitelist(
      enableGitOps,
      DEFAULT_WHITELIST_COMMANDS,
      overrideWhitelistCommands,
      appendWhitelistCommands,
    ),
    INFER_TOOLS_BASH_WHITELIST_PATTERNS: buildWhitelist(
      enableGitOps,
      DEFAULT_WHITELIST_PATTERNS,
      overrideWhitelistPatterns,
      appendWhitelistPatterns,
    ),
    INFER_TOOLS_WEB_FETCH_WHITELISTED_DOMAINS: buildWhitelist(
      true,
      DEFAULT_WEB_FETCH_DOMAINS,
      overrideWebFetchDomains,
      appendWebFetchDomains,
    ),
  };

  const inferBin = optional("INFER_BIN") || "infer";
  const child = spawn(inferBin, ["agent", "-m", model, task], {
    stdio: ["inherit", "pipe", "pipe"],
    env: childEnv,
  });

  if (!child.stdout || !child.stderr) {
    throw new Error("child stdio not piped - this should not happen");
  }

  const fileTee = createWriteStream(AGENT_OUTPUT_PATH);
  const lineFeed = new PassThrough();

  child.stdout.pipe(fileTee, { end: false });
  child.stdout.pipe(process.stdout, { end: false });
  child.stdout.pipe(lineFeed);
  child.stdout.on("end", () => fileTee.end());

  child.stderr.on("data", (chunk: Buffer) => {
    fileTee.write(chunk);
    process.stderr.write(chunk);
  });

  const ticker = new Ticker();
  const throttledTodos = throttleLatest<Todo[]>(async (todos) => {
    const markdown = renderPlan(todos);
    try {
      await github.updateZone(cookingCommentId, "plan", markdown);
      console.log(`[ticker] updated plan section (${todos.length} todos)`);
    } catch (e) {
      console.error("[ticker] PATCH failed:", e);
    }
  }, TICKER_DEBOUNCE_MS);
  ticker.addFlusher(throttledTodos.flush);

  ticker.on("TodoWrite", (inner: InnerToolResult) => {
    const todos = inner.data?.todos;
    if (Array.isArray(todos)) throttledTodos.call(todos);
  });

  await ticker.observe(readJsonLines(lineFeed));
  await ticker.flush();

  const exitCode = await waitForExit(child);

  console.log("");
  console.log("==========================================");
  console.log(`Agent exited with code ${exitCode}`);
  console.log("==========================================");

  if (enableGitOps) {
    try {
      await linkAgentPr({ github, cookingCommentId });
    } catch (e) {
      console.error("[pr-link] failed:", e);
    }
  } else {
    console.log("[pr-link] git operations disabled, skipping");
  }

  setOutput("exit-code", String(exitCode));
  setOutput(
    "result",
    exitCode === 0
      ? "Agent completed successfully"
      : `Agent failed with exit code ${exitCode}`,
  );

  return exitCode;
}

function renderPlan(todos: Todo[]): string {
  if (todos.length === 0) {
    return `${SPINNER_BLOCK}\n\n### Todos\n\n_(agent has not posted a plan yet)_`;
  }
  const lines = todos.map((t) => {
    const checkbox =
      t.status === "completed"
        ? "[x]"
        : t.status === "in_progress"
          ? "[~]"
          : "[ ]";
    return `- ${checkbox} ${t.content}`;
  });
  return [SPINNER_BLOCK, "", "### Todos", "", ...lines].join("\n");
}

function ensurePrHeadCheckedOut(ctx: PullRequestContext): void {
  try {
    if (ctx.isFork) {
      const localBranch = `pr-${ctx.prNumber}`;
      console.log(
        `[runner] fork PR; fetching pull/${ctx.prNumber}/head into ${localBranch}`,
      );
      sh(`git fetch origin pull/${ctx.prNumber}/head:${localBranch}`);
      sh(`git checkout ${localBranch}`);
    } else {
      console.log(`[runner] checking out PR head branch ${ctx.headRef}`);
      sh(`git fetch origin ${ctx.headRef}`);
      sh(`git checkout ${ctx.headRef}`);
    }
  } catch (e) {
    throw new Error(
      `Failed to check out PR head (${ctx.headRef}). Aborting before spawning the agent so it doesn't run against the wrong branch.`,
      { cause: e },
    );
  }
}

function collectDiffStat(baseRef: string): string {
  try {
    return sh(`git diff --stat origin/${baseRef}...HEAD`);
  } catch (e) {
    console.error("[runner] git diff --stat failed:", e);
    return "";
  }
}

function buildWhitelist(
  includeBase: boolean,
  base: string,
  override: string,
  append: string,
): string {
  const parts: string[] = [];
  if (includeBase) parts.push(override.trim() || base);
  if (append.trim()) parts.push(append.trim());
  return parts.join(",");
}

async function waitForExit(child: ReturnType<typeof spawn>): Promise<number> {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
  });
}

// The agent owns PR creation (see system prompt step 3). The runner does not
// open or fall back to opening a PR; it only surfaces the PR the agent opened by
// linking it in the cooking comment. If no PR exists, there is nothing to link.
async function linkAgentPr(args: {
  github: GithubClient;
  cookingCommentId: number;
}): Promise<void> {
  const branch = sh("git branch --show-current").trim();
  if (
    !branch ||
    branch === "main" ||
    branch === "master" ||
    branch === "HEAD"
  ) {
    console.log(`[pr-link] on ${branch || "detached HEAD"}, nothing to link`);
    return;
  }

  const existing = await args.github.findOpenPrForBranch(branch);
  if (!existing) {
    console.log(
      `[pr-link] no open PR found for ${branch}; the agent owns PR creation`,
    );
    return;
  }

  console.log(`[pr-link] linking PR: ${existing}`);
  await appendPrToComment(args.github, args.cookingCommentId, existing);
}

async function appendPrToComment(
  github: GithubClient,
  commentId: number,
  prUrl: string,
): Promise<void> {
  const middle = `### Pull Request\n\n${prUrl}`;
  try {
    await github.updateZone(commentId, "middle", middle);
  } catch (e) {
    console.error("[pr-link] failed to update comment with PR URL:", e);
  }
}

function sh(cmd: string): string {
  return execFileSync("bash", ["-c", cmd], { encoding: "utf8" });
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var ${name}`);
  }
  return v;
}

function optional(name: string): string {
  return process.env[name] ?? "";
}

function setOutput(name: string, value: string): void {
  const file = process.env["GITHUB_OUTPUT"];
  if (!file) {
    console.log(`(would set output) ${name}=${value}`);
    return;
  }
  if (value.includes("\n")) {
    const eof = `_GHO_EOF_${Math.random().toString(36).slice(2)}`;
    appendFileSync(file, `${name}<<${eof}\n${value}\n${eof}\n`);
  } else {
    appendFileSync(file, `${name}=${value}\n`);
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error("[runner] uncaught error:", e);
    process.exit(1);
  },
);

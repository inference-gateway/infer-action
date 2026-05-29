#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, createWriteStream } from "node:fs";
import { PassThrough } from "node:stream";
import { GithubClient, SPINNER_BLOCK } from "./github.js";
import { readJsonLines } from "./parser.js";
import { Ticker, throttleLatest } from "./ticker.js";
import type { InnerToolResult, Todo } from "./types.js";

const AGENT_OUTPUT_PATH = "/tmp/agent-output.txt";
const TICKER_DEBOUNCE_MS = 1500;
const DEFAULT_WHITELIST_COMMANDS = "git";
const DEFAULT_WHITELIST_PATTERNS = [
  "^git .*",
  "^gh pr (create|view|list|diff|checks|status)( .*)?$",
  "^gh issue (view|list)( .*)?$",
  "^gh (repo|run|release|workflow) (view|list)( .*)?$",
  "^gh auth status",
].join(",");

async function main(): Promise<number> {
  const token = required("GITHUB_TOKEN");
  const repo = required("INFER_REPO");
  const issueNumber = Number.parseInt(required("INFER_ISSUE_NUMBER"), 10);
  const cookingCommentId = Number.parseInt(
    required("INFER_COOKING_COMMENT_ID"),
    10,
  );
  const model = required("INFER_AGENT_MODEL");
  const issueTitle = optional("INFER_ISSUE_TITLE");
  const issueBody = optional("INFER_ISSUE_BODY");
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

  const github = new GithubClient({ token, repo });

  const systemPrompt = buildSystemPrompt({
    issueNumber,
    repo,
    customInstructions,
  });

  const task = `Resolve the following GitHub issue:\n\nIssue #${issueNumber}: ${issueTitle}\n\n${issueBody}`;

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
    INFER_TOOLS_BASH_WHITELIST_COMMANDS: buildBashWhitelist(
      enableGitOps,
      DEFAULT_WHITELIST_COMMANDS,
      overrideWhitelistCommands,
      appendWhitelistCommands,
    ),
    INFER_TOOLS_BASH_WHITELIST_PATTERNS: buildBashWhitelist(
      enableGitOps,
      DEFAULT_WHITELIST_PATTERNS,
      overrideWhitelistPatterns,
      appendWhitelistPatterns,
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
  // Re-emit the spinner on every plan update so it stays pinned at the top for
  // the whole run instead of being erased when the agent posts its first plan.
  // post-results removes it on always() once the run finishes.
  if (todos.length === 0) {
    return `${SPINNER_BLOCK}\n\n### Plan\n\n_(agent has not posted a plan yet)_`;
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
  return [SPINNER_BLOCK, "", "### Plan", "", ...lines].join("\n");
}

function buildSystemPrompt(args: {
  issueNumber: number;
  repo: string;
  customInstructions: string;
}): string {
  const base = `# GitHub Issue Agent

You are running in CI on issue #${args.issueNumber} in ${args.repo}.

The runner filesystem is ephemeral. Any change you do not commit and
push to a remote branch is lost when the job ends.

## Working style

Use TodoWrite to track your plan. Update it as you make progress - the
runner publishes your todos to the issue comment automatically, so you do
not need to comment on the issue yourself.

For questions or discussion (no code changes), just answer and stop -
skip the steps below.

## Code changes

If you will make code changes, follow this order. Do NOT defer commits to
the end of the run.

1. BEFORE any file edits, ensure you are on the working branch.
   If \`git rev-parse --abbrev-ref HEAD\` is \`main\` or \`master\`:

       git checkout -B fix/issue-${args.issueNumber}
       git push -u origin fix/issue-${args.issueNumber}

   Already on another branch? Stay on it. Do not call Edit/Write before
   this step succeeds - those edits will be lost.

2. AFTER each TodoWrite item you flip to "completed", validate then commit:

       <run the repo's checks and fix any failures>
       git add -A
       git commit -m "<type>(<scope>): <description>"
       git push

   Before committing, run the repository's own checks - lint, format,
   type-check, tests (e.g. \`npm run lint\`, \`npm test\`, \`task lint\` -
   whatever the repo provides) - and fix the failures. CI runs only AFTER
   this job ends, so you cannot fix it later. Do not batch commits. The job
   has a turn limit; if you defer commits, partial work is destroyed when
   the runner ends.

3. When all your work is committed and pushed, open the pull request
   yourself with a real description:

       gh pr create --base main --head fix/issue-${args.issueNumber} \\
         --title "<type>(<scope>): <what changed>" \\
         --body "Resolves #${args.issueNumber}

       ## Summary
       <2-4 sentences: what changed and why>

       ## Changes
       <bullet list of the notable changes>"

   Write the body yourself from the actual changes - do NOT leave it empty.
   Do NOT merge, close, edit, or review the PR. Never run \`gh pr merge\`,
   \`gh pr close\`, \`gh pr edit\`, or \`gh pr review\` - a human reviews and
   merges.

Use Conventional Commits: \`type(scope): description\` (feat, fix, docs,
style, refactor, test, chore).

## Output

End with a one-sentence summary of what you changed (or what you found,
if no changes). Do not call any GitHub comment APIs - the runner posts
your result.

## Environment

- \`gh\` CLI is authenticated via GITHUB_TOKEN.
- \`git\` is configured with the github-actions[bot] identity.
- Full file access to the checkout.
- The runner is ephemeral - unpushed commits are lost when the job ends.`;

  if (args.customInstructions.trim()) {
    return `${base}\n\n## Additional Instructions\n\n${args.customInstructions}`;
  }
  return base;
}

function buildBashWhitelist(
  enableGitOps: boolean,
  base: string,
  override: string,
  append: string,
): string {
  const parts: string[] = [];
  if (enableGitOps) parts.push(override.trim() || base);
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

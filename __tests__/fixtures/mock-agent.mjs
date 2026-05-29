#!/usr/bin/env node
/**
 * Mock `infer agent` for end-to-end testing of the Infer Action runner.
 *
 * Invoked the same way the real CLI is invoked by `dist/runner/index.js`:
 *   $ mock-agent.mjs agent -m <model> <task>
 *
 * Ignores all args. Emits a canned JSON-line stream to stdout that mirrors
 * the shape of real infer-CLI output, then exits 0 (or as MOCK_EXIT_CODE).
 *
 * Scenarios (pick one via env var MOCK_SCENARIO):
 *   - happy        Three TodoWrite passes + Read + one git commit on a fix/ branch
 *   - failures     happy path + interspersed envelope and inner failures
 *   - no-todos     Agent does work but never calls TodoWrite
 *   - empty        Agent exits immediately with no tool calls
 *
 * Knobs (env vars):
 *   MOCK_TICK_MS=500            delay between turns
 *   MOCK_EXIT_CODE=0            final exit code
 *   MOCK_MAKE_COMMIT=0          if 1, create a commit on a fix/issue-N branch
 *                               (so the runner's PR-link path can be exercised)
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const scenario = process.env.MOCK_SCENARIO ?? "happy";
const tickMs = Number.parseInt(process.env.MOCK_TICK_MS ?? "500", 10);
const exitCode = Number.parseInt(process.env.MOCK_EXIT_CODE ?? "0", 10);
const makeCommit = process.env.MOCK_MAKE_COMMIT === "1";
const issueNumber = Number.parseInt(
  process.env.INFER_ISSUE_NUMBER ?? "999",
  10,
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
let callCounter = 0;
const nextCallId = () => `mock_call_${++callCounter}`;

// Mirror the real CLI: each assistant completion carries per-turn token usage.
// Prompt tokens grow as the conversation accumulates context.
let turn = 0;
const tokenUsage = () => {
  turn += 1;
  const prompt_tokens = 1000 + turn * 500;
  const completion_tokens = 100 + turn * 20;
  return {
    prompt_tokens,
    completion_tokens,
    total_tokens: prompt_tokens + completion_tokens,
  };
};

const todos = (statuses) => [
  { id: "1", content: "Explore the repo", status: statuses[0] ?? "pending" },
  {
    id: "2",
    content: "Implement the change",
    status: statuses[1] ?? "pending",
  },
  { id: "3", content: "Verify locally", status: statuses[2] ?? "pending" },
];

const todoWritePair = async (statuses) => {
  const callId = nextCallId();
  const data = { todos: todos(statuses) };
  emit({
    role: "assistant",
    content: "",
    token_usage: tokenUsage(),
    tool_calls: [
      {
        id: callId,
        type: "function",
        function: { name: "TodoWrite", arguments: JSON.stringify(data) },
      },
    ],
  });
  emit({
    role: "tool",
    tool_call_id: callId,
    content:
      "Result of tool call: " +
      JSON.stringify({ tool_name: "TodoWrite", success: true, data }),
  });
  await sleep(tickMs);
};

const successfulRead = async () => {
  const callId = nextCallId();
  emit({
    role: "assistant",
    content: "",
    token_usage: tokenUsage(),
    tool_calls: [
      {
        id: callId,
        type: "function",
        function: { name: "Read", arguments: '{"file_path":"README.md"}' },
      },
    ],
  });
  emit({
    role: "tool",
    tool_call_id: callId,
    content:
      "Result of tool call: " +
      JSON.stringify({
        tool_name: "Read",
        success: true,
        data: { content: "# Mock readme" },
      }),
  });
  await sleep(tickMs);
};

const envelopeFailure = async (toolName, errorMsg) => {
  const callId = nextCallId();
  emit({
    role: "assistant",
    content: "",
    token_usage: tokenUsage(),
    tool_calls: [
      {
        id: callId,
        type: "function",
        function: { name: toolName, arguments: "{}" },
      },
    ],
  });
  emit({
    role: "tool",
    tool_call_id: callId,
    content: `Tool execution failed: ${errorMsg}`,
  });
  await sleep(tickMs);
};

const envelopeFailureEmpty = async (toolName) => {
  // Reproduces the screenshot bug: envelope says "failed" but the message
  // after the colon is empty. The runner must drop this row entirely.
  const callId = nextCallId();
  emit({
    role: "assistant",
    content: "",
    token_usage: tokenUsage(),
    tool_calls: [
      {
        id: callId,
        type: "function",
        function: { name: toolName, arguments: "{}" },
      },
    ],
  });
  emit({
    role: "tool",
    tool_call_id: callId,
    content: "Tool execution failed: ",
  });
  await sleep(tickMs);
};

const innerFailure = async (toolName, errorMsg) => {
  const callId = nextCallId();
  emit({
    role: "assistant",
    content: "",
    token_usage: tokenUsage(),
    tool_calls: [
      {
        id: callId,
        type: "function",
        function: { name: toolName, arguments: "{}" },
      },
    ],
  });
  emit({
    role: "tool",
    tool_call_id: callId,
    content:
      "Result of tool call: " +
      JSON.stringify({
        tool_name: toolName,
        success: false,
        error: errorMsg,
      }),
  });
  await sleep(tickMs);
};

const finalMessage = (text) => {
  emit({ role: "assistant", content: text, token_usage: tokenUsage() });
};

const commitOnFixBranch = () => {
  const branch = `fix/issue-${issueNumber}`;
  try {
    execFileSync("git", ["checkout", "-b", branch], { stdio: "pipe" });
  } catch {
    execFileSync("git", ["checkout", branch], { stdio: "pipe" });
  }
  writeFileSync("hello.txt", "hi from the mock agent\n");
  execFileSync("git", ["add", "hello.txt"], { stdio: "pipe" });
  execFileSync(
    "git",
    ["commit", "-m", `feat: add hello.txt for issue #${issueNumber}`],
    { stdio: "pipe" },
  );
  console.error(`[mock-agent] committed to branch ${branch}`);
};

async function scenarioHappy() {
  await sleep(50);
  await todoWritePair(["pending", "pending", "pending"]);
  await todoWritePair(["in_progress", "pending", "pending"]);
  await successfulRead();
  await todoWritePair(["completed", "in_progress", "pending"]);
  if (makeCommit) commitOnFixBranch();
  await todoWritePair(["completed", "completed", "in_progress"]);
  await todoWritePair(["completed", "completed", "completed"]);
  finalMessage("Done. Added hello.txt with one line.");
}

async function scenarioFailures() {
  await sleep(50);
  await todoWritePair(["in_progress", "pending", "pending"]);
  await envelopeFailure(
    "WebFetch",
    "URL validation failed: domain not whitelisted",
  );
  await envelopeFailure(
    "WebFetch",
    "URL validation failed: domain not whitelisted",
  );
  await envelopeFailureEmpty("Bash");
  await envelopeFailureEmpty("Bash");
  await innerFailure("Bash", "command not whitelisted: redis-cli ping");
  await todoWritePair(["completed", "completed", "completed"]);
  finalMessage("Done. Hit some whitelist limits; see report.");
}

async function scenarioNoTodos() {
  await sleep(50);
  await successfulRead();
  await successfulRead();
  finalMessage("Done. Did not need a plan.");
}

async function scenarioEmpty() {
  await sleep(50);
  finalMessage("Nothing to do.");
}

const scenarios = {
  happy: scenarioHappy,
  failures: scenarioFailures,
  "no-todos": scenarioNoTodos,
  empty: scenarioEmpty,
};

async function main() {
  const fn = scenarios[scenario];
  if (!fn) {
    console.error(
      `[mock-agent] unknown MOCK_SCENARIO="${scenario}". Available: ${Object.keys(scenarios).join(", ")}`,
    );
    process.exit(2);
  }
  console.error(
    `[mock-agent] starting scenario="${scenario}" tickMs=${tickMs}`,
  );
  await fn();
  console.error(`[mock-agent] done; exiting ${exitCode}`);
  process.exit(exitCode);
}

main().catch((e) => {
  console.error("[mock-agent] unhandled error:", e);
  process.exit(1);
});

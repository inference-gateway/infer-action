#!/usr/bin/env bun
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
 *   - incomplete   Agent is cut off mid-task: todos left unfinished and the
 *                  final message trails off (exercises the stopped-early flag)
 *   - no-git       Agent finishes its plan but only edits files - never
 *                  branches/commits/pushes (issue #85; exercises recovery)
 *   - hang         Agent edits a file, emits compaction_started, then wedges
 *                  forever (never exits) - reproduces the job-timeout hang.
 *                  Send SIGINT to the runner (or run under a tiny job timeout)
 *                  to exercise the cancel signal handler + recover-step salvage.
 *                  Pair with INFER_LOGGING_DEBUG=true to see the compaction line.
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

let turn = 0;
let cumPrompt = 0;
let cumCompletion = 0;
const tokenUsage = () => {
  turn += 1;
  const prompt_tokens = 1000 + turn * 500;
  const completion_tokens = 100 + turn * 20;
  cumPrompt += prompt_tokens;
  cumCompletion += completion_tokens;
  return {
    prompt_tokens,
    completion_tokens,
    total_tokens: prompt_tokens + completion_tokens,
  };
};

// Mirror the real CLI's session-end summary line (emitted once on exit, keyed
// by `type` not `role`). Carries the run's billed cost so the post-results
// footer can render a Cost line. Computed from a small fake per-token rate.
const sessionStats = () => {
  const RATE_IN = 0.000003; // fake $/prompt-token
  const RATE_OUT = 0.000015; // fake $/completion-token
  const input = Number((cumPrompt * RATE_IN).toFixed(6));
  const output = Number((cumCompletion * RATE_OUT).toFixed(6));
  emit({
    type: "session_stats",
    message: "Session complete",
    model: "mock/mock-v1",
    prompt_tokens: cumPrompt,
    completion_tokens: cumCompletion,
    total_tokens: cumPrompt + cumCompletion,
    requests: turn,
    cost: {
      input,
      output,
      total: Number((input + output).toFixed(6)),
      currency: "USD",
    },
  });
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
  sessionStats();
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
  sessionStats();
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

// Reproduces the screenshot failure: the agent makes progress but is cut off
// mid-task - some todos never reach "completed" and the final message trails
// off mid-sentence. The runner must flag this run as stopped-early.
async function scenarioIncomplete() {
  await sleep(50);
  await todoWritePair(["pending", "pending", "pending"]);
  await todoWritePair(["in_progress", "pending", "pending"]);
  await successfulRead();
  await todoWritePair(["completed", "in_progress", "pending"]);
  finalMessage(
    "The existing tests pass. Now let me run the new project status tests:",
  );
  sessionStats();
}

// Reproduces issue #85: the agent does the work and completes its whole plan,
// but never branches/commits/pushes/opens a PR - it only edits files, leaving a
// dirty tree. The runner's recovery safety net must rescue that work into a
// pushed draft PR (without this scenario the bug looked like "stopped early").
async function scenarioNoGit() {
  await sleep(50);
  await todoWritePair(["in_progress", "pending", "pending"]);
  writeFileSync("recovered.txt", "edited by the agent but never committed\n");
  await todoWritePair(["completed", "in_progress", "pending"]);
  await todoWritePair(["completed", "completed", "completed"]);
  finalMessage("All done — implemented the change.");
  sessionStats();
}

// Reproduces the reported job-timeout hang: the agent makes progress, edits a
// file, emits a `compaction_started` (which the runner surfaces with debug on),
// then WEDGES — never emitting compaction_completed and never exiting, exactly
// as a stuck compaction/provider call would. The runner's signal handler must
// reap it on cancellation and the recover step must salvage the uncommitted edit.
async function scenarioHang() {
  await sleep(50);
  await todoWritePair(["in_progress", "pending", "pending"]);
  writeFileSync("wedged.txt", "edited by the agent right before it hung\n");
  await todoWritePair(["completed", "in_progress", "pending"]);
  emit({ type: "compaction_started", message: "compacting conversation" });
  console.error(
    "[mock-agent] simulating a hang inside compaction; not exiting",
  );
  await new Promise(() => {});
}

const scenarios = {
  happy: scenarioHappy,
  failures: scenarioFailures,
  "no-todos": scenarioNoTodos,
  empty: scenarioEmpty,
  incomplete: scenarioIncomplete,
  "no-git": scenarioNoGit,
  hang: scenarioHang,
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

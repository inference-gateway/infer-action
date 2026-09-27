// Composes the reminders the action hands to the CLI via the
// INFER_REMINDERS_CONFIG env var (set on the agent child in runner.ts). The
// composed config sets merge: true so the entries here merge onto the CLI's
// built-in defaults by name (todo-hygiene and, when memory is enabled, the
// memory nudges survive; the CLI prunes the memory ones itself when memory is
// off). Requires CLI >= v0.130.0 (merge support; INFER_REMINDERS_CONFIG and the
// on_failure trigger shipped in v0.129.0).
//
// Power users can supply their own base with the `reminders-config` input; the
// composed entries are appended to it. See resolveRemindersYaml.

import type { TaskContext } from "./context.js";

export interface ReminderEntry {
  name: string;
  hook:
    | "pre_session"
    | "pre_stream"
    | "post_stream"
    | "pre_tool"
    | "post_tool"
    | "pre_queue_drain"
    | "post_queue_drain"
    | "post_session";
  trigger: "always" | "interval" | "turns_before_max" | "once" | "on_failure";
  interval?: number;
  threshold?: number;
  text: string;
}

const CONTEXT_INTERVAL = 5;
const WRAP_UP_THRESHOLD = 10;

// A "turn" is one LLM request; weak models emitting ~1 tool call per turn need
// far more wrap-up headroom than 10 turns on a large budget (cli#1006), so the
// threshold scales to 10% of max-turns with the old constant as the floor.
export function wrapUpThreshold(maxTurns: number): number {
  if (!Number.isFinite(maxTurns) || maxTurns <= 0) return WRAP_UP_THRESHOLD;
  return Math.max(WRAP_UP_THRESHOLD, Math.round(maxTurns * 0.1));
}

// This run's request: the triggering comment, else the issue or PR that triggered the
// run, else the direct prompt. Only it is checked, so a "demo" in older comments, the
// diff stat, or file names never opts a run into recording.
function requestText(ctx: TaskContext): string {
  if (ctx.kind === "direct") return ctx.prompt;
  if (ctx.kind === "issue") {
    return ctx.triggeringComment?.body ?? `${ctx.issueTitle}\n${ctx.issueBody}`;
  }
  return (
    ctx.comments.find((c) => c.isTrigger)?.body ??
    `${ctx.prTitle}\n${ctx.prBody}`
  );
}

// Whether the user asked for a demo in this run's request. record-demo only makes
// recording possible; the demo reminder, the tmux allow-list and the recording tools
// are switched on for a run only when this is true.
export function asksForDemo(ctx: TaskContext): boolean {
  return /\bdemo(s|nstrat\w*)?\b/i.test(requestText(ctx));
}

export interface ComposeRemindersOptions {
  enableGitOps: boolean;
  maxTurns?: number;
  recordDemo?: boolean;
}

export function composeReminders(
  ctx: TaskContext,
  opts: ComposeRemindersOptions,
): ReminderEntry[] {
  const entries: ReminderEntry[] = [];
  const writable =
    opts.enableGitOps && !(ctx.kind === "pull_request" && ctx.isFork);

  entries.push({
    name: "infer-action-context",
    hook: "pre_stream",
    trigger: "interval",
    interval: CONTEXT_INTERVAL,
    text: opts.enableGitOps
      ? contextReminderText(ctx)
      : "<system-reminder>Keep your TodoWrite plan current as you go. Only answering a question? Ignore this.</system-reminder>",
  });

  if (writable) {
    entries.push({
      name: "infer-action-wrap-up",
      hook: "pre_stream",
      trigger: "turns_before_max",
      threshold: wrapUpThreshold(opts.maxTurns ?? 0),
      text: wrapUpText(ctx),
    });

    entries.push({
      name: "infer-action-failed-tool",
      hook: "post_tool",
      trigger: "on_failure",
      text: failedToolText(),
    });
  }

  if (opts.recordDemo) {
    entries.push({
      name: "infer-action-record-demo",
      hook: "post_stream",
      trigger: "once",
      text: recordDemoText(),
    });
  }

  return entries;
}

// The periodic context reminder text, matched to the run context. Kept short -
// it is injected every CONTEXT_INTERVAL turns.
function contextReminderText(ctx: TaskContext): string {
  if (ctx.kind === "pull_request" && ctx.isFork) {
    return "<system-reminder>This PR is from a fork - you CANNOT commit or push. Investigate with file reads and git diff, then answer the user's question or summarise. Keep your TodoWrite plan current.</system-reminder>";
  }
  if (ctx.kind === "pull_request") {
    return `<system-reminder>Keep your TodoWrite plan current. If you changed files, commit + push after each step so PR #${ctx.prNumber} stays current - unpushed work is lost when the job ends. Only reviewing or answering? Do not change, commit, or push anything.</system-reminder>`;
  }
  return "<system-reminder>Keep your TodoWrite plan current. Changing code? Work on a pushed branch with an open draft PR (`gh pr create --draft`) and commit + push after each step so nothing is lost - never commit on or push to main. Only answering a question? Ignore this.</system-reminder>";
}

function wrapUpText(ctx: TaskContext): string {
  const target =
    ctx.kind === "pull_request"
      ? `so PR #${ctx.prNumber} is up to date, and update the PR body with a checklist of the remaining todos`
      : "and make sure the draft PR exists: `gh pr create --draft` with a title like `wip: <short description of the task>` and a body listing the remaining todos and unfinished work, so a human can pick up where you left off";
  return `<system-reminder>You are close to the turn limit. Stop starting new work - if you have uncommitted or unpushed changes, commit and push them now ${target}. If the repo's checks fail on commit and you cannot fix them in the remaining turns, commit with --no-verify as a last resort rather than losing the work. Unpushed work is lost when the run ends. If you changed nothing, just finish your summary.</system-reminder>`;
}

// Composed only when the user asked for a demo. Fires once, on the first reply without
// tool calls - the agent trying to finish - which makes the CLI run another turn. Only
// text after the last tool call reaches the result comment, so the summary is restated.
function recordDemoText(): string {
  return `<system-reminder>The user asked for a demo: before you finish, record a short
terminal demo of your change. A virtual display shows a terminal attached to the tmux session
\`demo\` (106x29, working directory = the repository). If your todos are not all done, finish
them first and record the demo as your last step. If the change has nothing to show in a
terminal, skip the recording and say why in your summary.

1. Prepare what the demo needs (build the binary; put sample input under /tmp, not in the
   repository), then clear the terminal: \`tmux send-keys -t demo 'clear' Enter\`.
2. Call RecordStart with {"mode": "screen"}.
3. Type each command with \`tmux send-keys -t demo '<command>' Enter\`, then \`sleep 2\` so
   viewers can read the output (\`tmux capture-pane -p -t demo\` shows the screen). Show one
   to three commands; the recording stops on its own after 60 seconds.
4. Call RecordStop yourself - nobody else will. The recording is converted to a GIF and
   embedded in the result comment automatically; do not convert, upload, or commit it.
5. Then write your complete final summary again: only text after your last tool call
   reaches the result comment.

Never type or display secrets, tokens, or environment variables in the demo terminal.</system-reminder>`;
}

function failedToolText(): string {
  return (
    "<system-reminder>That tool call FAILED - the change did NOT happen. " +
    "Re-read or re-check, fix it, and retry. Never mark a todo done or claim " +
    "success on a failed call.</system-reminder>"
  );
}

// JSON string literals are valid YAML scalars, so JSON.stringify handles all
// quoting/escaping without a YAML dependency. merge: true layers the entries
// onto the CLI's built-in defaults instead of replacing them.
export function renderRemindersYaml(entries: ReminderEntry[]): string {
  const lines = ["enabled: true", "merge: true", "reminders:"];
  for (const e of entries) {
    lines.push(`  - name: ${JSON.stringify(e.name)}`);
    lines.push(`    hook: ${JSON.stringify(e.hook)}`);
    lines.push(`    trigger: ${JSON.stringify(e.trigger)}`);
    if (e.interval !== undefined) lines.push(`    interval: ${e.interval}`);
    if (e.threshold !== undefined) lines.push(`    threshold: ${e.threshold}`);
    lines.push(`    text: ${JSON.stringify(e.text)}`);
  }
  return lines.join("\n") + "\n";
}

// Resolves the reminders YAML to hand the CLI: the composed entries, appended to the
// consumer's `reminders-config` when one is set. A consumer entry with the same name
// replaces the composed one, and the consumer's `enabled` and `merge` keys are kept.
export function resolveRemindersYaml(
  remindersConfig: string,
  ctx: TaskContext,
  opts: ComposeRemindersOptions,
): string {
  const composed = composeReminders(ctx, opts);
  const custom = remindersConfig.trim();
  if (!custom) return renderRemindersYaml(composed);
  return appendReminders(custom, composed);
}

interface CustomRemindersConfig {
  reminders?: { name?: unknown }[] | null;
}

// JSON is valid YAML for the CLI's parser, so the merged config is emitted as JSON.
// Input that does not parse to a reminders mapping is passed through unchanged, so
// the CLI reports the problem exactly as it did before.
function appendReminders(custom: string, composed: ReminderEntry[]): string {
  const cfg = parseCustomConfig(custom);
  if (!cfg) return `${custom}\n`;
  const own = cfg.reminders ?? [];
  const taken = new Set(own.map((r) => r.name));
  const reminders = [...own, ...composed.filter((e) => !taken.has(e.name))];
  return `${JSON.stringify({ ...cfg, reminders })}\n`;
}

function parseCustomConfig(custom: string): CustomRemindersConfig | undefined {
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(custom);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  const reminders = (parsed as Record<string, unknown>)["reminders"];
  if (reminders != null && !Array.isArray(reminders)) return undefined;
  return parsed as CustomRemindersConfig;
}

// Composes the reminders the action hands to the CLI via the
// INFER_REMINDERS_CONFIG env var (set on the agent child in runner.ts). The
// composed config sets merge: true so the entries here merge onto the CLI's
// built-in defaults by name (todo-hygiene and, when memory is enabled, the
// memory nudges survive; the CLI prunes the memory ones itself when memory is
// off). Requires CLI >= v0.130.0 (merge support; INFER_REMINDERS_CONFIG and the
// on_failure trigger shipped in v0.129.0).
//
// Power users can bypass composition entirely with the `reminders-config`
// input: its verbatim YAML is passed through unchanged. See resolveRemindersYaml.

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

export interface ComposeRemindersOptions {
  enableGitOps: boolean;
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
      threshold: WRAP_UP_THRESHOLD,
      text: wrapUpText(ctx),
    });

    entries.push({
      name: "infer-action-failed-tool",
      hook: "post_tool",
      trigger: "on_failure",
      text: failedToolText(),
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
    return `<system-reminder>Keep your TodoWrite plan current, and commit + push after each step so PR #${ctx.prNumber} stays current - unpushed work is lost when the job ends.</system-reminder>`;
  }
  return "<system-reminder>Keep your TodoWrite plan current. Changing code? Work on a pushed branch with an open draft PR (`gh pr create --draft`) and commit + push after each step so nothing is lost. Only answering a question? Ignore this.</system-reminder>";
}

function wrapUpText(ctx: TaskContext): string {
  const target =
    ctx.kind === "pull_request"
      ? `so PR #${ctx.prNumber} is up to date`
      : "and make sure the draft PR exists (`gh pr create --draft`)";
  return `<system-reminder>You are close to the turn limit. Stop starting new work - commit and push everything now ${target}. Unpushed work is lost when the run ends.</system-reminder>`;
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

// Resolves the reminders YAML to hand the CLI. A non-empty `remindersConfig`
// (the reminders-config input) is passed through verbatim, replacing the
// composed default for power users; otherwise the default is composed from
// ctx + opts.
export function resolveRemindersYaml(
  remindersConfig: string,
  ctx: TaskContext,
  opts: ComposeRemindersOptions,
): string {
  const verbatim = remindersConfig.trim();
  if (verbatim) return verbatim.endsWith("\n") ? verbatim : verbatim + "\n";
  return renderRemindersYaml(composeReminders(ctx, opts));
}

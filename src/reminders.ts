// Composes the CLI's native reminders file (~/.infer/reminders.yaml). The CLI
// reads the reminder list from a file or the INFER_REMINDERS_CONFIG env var
// (env can also master-switch it via INFER_REMINDERS_ENABLED), and a loaded
// list replaces the CLI's built-in list - so the entries here must also cover
// todo hygiene and, when the action configured persistent memory, the memory
// nudges. A project-committed .infer/reminders.yaml takes precedence over this
// file by CLI resolution. Requires CLI >= v0.125.0 (>= v0.129.0 for the
// on_failure trigger used by the failed-tool nudge below).
//
// Power users can bypass composition entirely with the `reminders-config`
// input (INFER_REMINDERS_CONFIG): its verbatim YAML is written straight to
// ~/.infer/reminders.yaml, replacing the composed default. See
// resolveRemindersYaml.

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { TaskContext } from "./context.js";
import { buildReminder } from "./prompts.js";

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

// Sane defaults. The context-reminder interval is overridable via the
// `reminder-interval` input, and the wrap-up threshold via `wrap-up-threshold`.
// The memory-hygiene cadence mirrors the CLI built-in
// (defaultMemoryReminderInterval = 10); it is intentionally not exposed as an
// input so the action's memory nudges stay aligned with the CLI's built-ins.
export const DEFAULT_CONTEXT_INTERVAL = 5;
export const DEFAULT_WRAP_UP_THRESHOLD = 10;
const MEMORY_INTERVAL = 10;

export interface ComposeRemindersOptions {
  enableGitOps: boolean;
  memoryEnabled: boolean;
  contextInterval?: number | undefined;
  wrapUpThreshold?: number | undefined;
}

export function composeReminders(
  ctx: TaskContext,
  opts: ComposeRemindersOptions,
): ReminderEntry[] {
  const entries: ReminderEntry[] = [];
  const writable =
    opts.enableGitOps && !(ctx.kind === "pull_request" && ctx.isFork);
  const contextInterval = opts.contextInterval ?? DEFAULT_CONTEXT_INTERVAL;
  const wrapUpThreshold = opts.wrapUpThreshold ?? DEFAULT_WRAP_UP_THRESHOLD;

  entries.push({
    name: "infer-action-context",
    hook: "pre_stream",
    trigger: "interval",
    interval: contextInterval,
    text: opts.enableGitOps
      ? buildReminder(ctx)
      : "<system-reminder>Keep your TodoWrite plan current as you go. Only answering a question? Ignore this.</system-reminder>",
  });

  if (writable) {
    entries.push({
      name: "infer-action-wrap-up",
      hook: "pre_stream",
      trigger: "turns_before_max",
      threshold: wrapUpThreshold,
      text: wrapUpText(ctx),
    });

    entries.push({
      name: "infer-action-failed-tool",
      hook: "post_tool",
      trigger: "on_failure",
      text: failedToolText(),
    });
  }

  if (opts.memoryEnabled) {
    entries.push(
      {
        name: "memory-consult",
        hook: "pre_session",
        trigger: "once",
        text: MEMORY_CONSULT_TEXT,
      },
      {
        name: "memory-hygiene",
        hook: "pre_stream",
        trigger: "interval",
        interval: MEMORY_INTERVAL,
        text: MEMORY_HYGIENE_TEXT,
      },
    );
  }

  return entries;
}

// The CLI's built-in memory reminder texts, duplicated verbatim because a
// loaded reminders.yaml replaces the built-in list. Keep these in sync with
// config.MemoryReminders in inference-gateway/cli.
const MEMORY_CONSULT_TEXT =
  "The persistent memory index (MEMORY.md) is already injected into your context. Before relying on a fact, load it in full with the Memory tool (read with its name). As you learn durable facts about the user, project, or workflow, record them with the Memory tool (write); it keeps the index in sync. Do not mention this reminder to the user.";

const MEMORY_HYGIENE_TEXT =
  "If you have learned durable facts about the user, project, or workflow this session - preferences, conventions, recurring gotchas, decisions worth keeping - record them now with the Memory tool (write) so they persist across sessions; it keeps the MEMORY.md index in sync. Skip if there is nothing durable to save. Do not mention this reminder to the user.";

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
    "Re-read the file or re-check the command, fix the call, and retry. " +
    "Never mark a todo completed or claim success based on a failed call.</system-reminder>"
  );
}

// JSON string literals are valid YAML scalars, so JSON.stringify handles all
// quoting/escaping without a YAML dependency.
export function renderRemindersYaml(entries: ReminderEntry[]): string {
  const lines = ["enabled: true", "reminders:"];
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

export function defaultRemindersPath(): string {
  return join(homedir(), ".infer", "reminders.yaml");
}

// Resolves the reminders YAML to write. A non-empty `remindersConfig`
// (INFER_REMINDERS_CONFIG) is passed through verbatim, replacing the composed
// default for power users; otherwise the default is composed from ctx + opts.
export function resolveRemindersYaml(
  remindersConfig: string,
  ctx: TaskContext,
  opts: ComposeRemindersOptions,
): string {
  const verbatim = remindersConfig.trim();
  if (verbatim) return verbatim.endsWith("\n") ? verbatim : verbatim + "\n";
  return renderRemindersYaml(composeReminders(ctx, opts));
}

// Best-effort: reminders are a nudge, not a correctness requirement.
export function writeRemindersFile(
  yaml: string,
  path: string = defaultRemindersPath(),
): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, yaml);
    return true;
  } catch (e) {
    console.error("[runner] failed to write reminders file:", e);
    return false;
  }
}

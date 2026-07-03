// Composes the CLI's native reminders file (~/.infer/reminders.yaml). The CLI
// only reads the reminder list from a file (env can master-switch it via
// INFER_REMINDERS_ENABLED), and a loaded file replaces the CLI's built-in
// list - so the entries here must also cover todo hygiene and, when the
// action configured persistent memory, the memory nudges. A project-committed
// .infer/reminders.yaml takes precedence over this file by CLI resolution.
// Requires CLI >= v0.125.0.

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { TaskContext } from "./context.js";
import { buildReminder } from "./prompts.js";

export interface ReminderEntry {
  name: string;
  hook: "pre_session" | "pre_stream";
  trigger: "interval" | "turns_before_max" | "once";
  interval?: number;
  threshold?: number;
  text: string;
}

const CONTEXT_INTERVAL = 5;
const WRAP_UP_THRESHOLD = 10;
const MEMORY_INTERVAL = 10;

export function composeReminders(
  ctx: TaskContext,
  opts: { enableGitOps: boolean; memoryEnabled: boolean },
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
      ? buildReminder(ctx)
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
  }

  if (opts.memoryEnabled) {
    entries.push(
      {
        name: "memory-consult",
        hook: "pre_session",
        trigger: "once",
        text: "<system-reminder>Persistent memory is enabled: consult it before starting - read the MEMORY.md index and any relevant memory files.</system-reminder>",
      },
      {
        name: "memory-hygiene",
        hook: "pre_stream",
        trigger: "interval",
        interval: MEMORY_INTERVAL,
        text: "<system-reminder>Record durable, non-obvious facts you learn with the Memory tool so future runs benefit.</system-reminder>",
      },
    );
  }

  return entries;
}

function wrapUpText(ctx: TaskContext): string {
  const target =
    ctx.kind === "pull_request"
      ? `so PR #${ctx.prNumber} is up to date`
      : "and make sure the draft PR exists (`gh pr create --draft`)";
  return `<system-reminder>You are close to the turn limit. Stop starting new work - commit and push everything now ${target}. Unpushed work is lost when the run ends.</system-reminder>`;
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

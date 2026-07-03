import { describe, expect, it } from "bun:test";
import type { TaskContext } from "../src/context.js";
import {
  composeReminders,
  renderRemindersYaml,
  resolveRemindersYaml,
} from "../src/reminders.js";

function issueCtx(): TaskContext {
  return {
    kind: "issue",
    issueNumber: 42,
    issueTitle: "t",
    issueBody: "b",
  } as TaskContext;
}

function prCtx(over: { isFork?: boolean } = {}): TaskContext {
  return {
    kind: "pull_request",
    prNumber: 112,
    prTitle: "t",
    prBody: "b",
    headRef: "feat/x",
    baseRef: "main",
    headRepoFullName: "o/r",
    isFork: over.isFork ?? false,
    triggeringCommentId: 0,
    comments: [],
  } as unknown as TaskContext;
}

describe("composeReminders", () => {
  it("issue context: periodic context reminder, a turn-limit wrap-up, and a failed-tool nudge", () => {
    const entries = composeReminders(issueCtx(), {
      enableGitOps: true,
      memoryEnabled: false,
    });

    expect(entries.map((e) => e.name)).toEqual([
      "infer-action-context",
      "infer-action-wrap-up",
      "infer-action-failed-tool",
    ]);
    const [ctx, wrapUp, failedTool] = entries;
    expect(ctx?.trigger).toBe("interval");
    expect(ctx?.interval).toBe(5);
    expect(ctx?.text).toContain("TodoWrite");
    expect(ctx?.text).toContain("gh pr create --draft");
    expect(wrapUp?.trigger).toBe("turns_before_max");
    expect(wrapUp?.threshold).toBe(10);
    expect(wrapUp?.text).toContain("draft PR exists");
    expect(failedTool?.hook).toBe("post_tool");
    expect(failedTool?.trigger).toBe("on_failure");
    expect(failedTool?.text).toContain("did NOT happen");
    expect(failedTool?.text).toContain("failed call");
  });

  it("PR context: wrap-up targets the existing PR", () => {
    const entries = composeReminders(prCtx(), {
      enableGitOps: true,
      memoryEnabled: false,
    });

    expect(entries[0]?.text).toContain("PR #112");
    const wrapUp = entries.find((e) => e.name === "infer-action-wrap-up");
    expect(wrapUp?.text).toContain("PR #112 is up to date");
    expect(wrapUp?.text).not.toContain("gh pr create");
  });

  it("fork PR: view-only context reminder, no wrap-up and no failed-tool nudge", () => {
    const entries = composeReminders(prCtx({ isFork: true }), {
      enableGitOps: true,
      memoryEnabled: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toContain("CANNOT commit or push");
    expect(
      entries.find((e) => e.name === "infer-action-failed-tool"),
    ).toBeUndefined();
  });

  it("git ops off: a single todo-only reminder with no git wording and no failed-tool nudge", () => {
    const entries = composeReminders(issueCtx(), {
      enableGitOps: false,
      memoryEnabled: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toContain("TodoWrite");
    expect(entries[0]?.text).not.toContain("push");
    expect(entries[0]?.text).not.toContain("git");
    expect(
      entries.find((e) => e.name === "infer-action-failed-tool"),
    ).toBeUndefined();
  });

  it("memory enabled: adds the consult-once and hygiene reminders with the CLI's built-in texts", () => {
    const entries = composeReminders(issueCtx(), {
      enableGitOps: true,
      memoryEnabled: true,
    });

    const names = entries.map((e) => e.name);
    expect(names).toContain("memory-consult");
    expect(names).toContain("memory-hygiene");
    const consult = entries.find((e) => e.name === "memory-consult");
    expect(consult?.hook).toBe("pre_session");
    expect(consult?.trigger).toBe("once");
    // Verbatim CLI built-in text (no <system-reminder> wrapper - matches the CLI)
    expect(consult?.text).toContain("MEMORY.md");
    expect(consult?.text).not.toContain("<system-reminder>");
    const hygiene = entries.find((e) => e.name === "memory-hygiene");
    expect(hygiene?.interval).toBe(10);
    expect(hygiene?.text).toContain("Memory tool");
    expect(hygiene?.text).not.toContain("<system-reminder>");
  });
});

describe("renderRemindersYaml", () => {
  it("renders the schema the CLI expects, with JSON-quoted scalars", () => {
    const yaml = renderRemindersYaml(
      composeReminders(issueCtx(), {
        enableGitOps: true,
        memoryEnabled: false,
      }),
    );

    expect(yaml.startsWith("enabled: true\nreminders:\n")).toBe(true);
    expect(yaml).toContain('  - name: "infer-action-context"');
    expect(yaml).toContain('    hook: "pre_stream"');
    expect(yaml).toContain('    trigger: "interval"');
    expect(yaml).toContain("    interval: 5");
    expect(yaml).toContain("    threshold: 10");
    expect(yaml).toContain('  - name: "infer-action-failed-tool"');
    expect(yaml).toContain('    hook: "post_tool"');
    expect(yaml).toContain('    trigger: "on_failure"');
    for (const line of yaml.trimEnd().split("\n").slice(2)) {
      expect(line).toMatch(
        /^ {2}- name: |^ {4}(hook|trigger|interval|threshold|text): /,
      );
    }
  });

  it("escapes quotes and newlines in text via JSON string encoding", () => {
    const yaml = renderRemindersYaml([
      {
        name: "x",
        hook: "pre_stream",
        trigger: "interval",
        interval: 1,
        text: 'say "hi"\nthen stop',
      },
    ]);

    expect(yaml).toContain('    text: "say \\"hi\\"\\nthen stop"');
  });
});

describe("resolveRemindersYaml", () => {
  it("passes a non-empty reminders-config through verbatim, replacing the composed default", () => {
    const custom =
      'enabled: true\nreminders:\n  - name: mine\n    hook: pre_session\n    trigger: once\n    text: "hi"\n';
    expect(
      resolveRemindersYaml(custom, issueCtx(), {
        enableGitOps: true,
        memoryEnabled: true,
      }),
    ).toBe(custom);
  });

  it("appends a trailing newline to verbatim YAML that lacks one", () => {
    const custom = "enabled: false\nreminders: []";
    expect(
      resolveRemindersYaml(custom, issueCtx(), {
        enableGitOps: true,
        memoryEnabled: false,
      }),
    ).toBe(custom + "\n");
  });

  it("treats whitespace-only reminders-config as empty and composes the default", () => {
    const yaml = resolveRemindersYaml("   \n  ", issueCtx(), {
      enableGitOps: true,
      memoryEnabled: false,
    });
    expect(yaml).toContain("infer-action-context");
    expect(yaml).toContain("infer-action-failed-tool");
  });

  it("composes the default when reminders-config is empty", () => {
    const yaml = resolveRemindersYaml("", issueCtx(), {
      enableGitOps: true,
      memoryEnabled: false,
    });
    expect(yaml).toContain("    interval: 5");
    expect(yaml).toContain("    threshold: 10");
  });
});

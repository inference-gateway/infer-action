import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskContext } from "../src/context.js";
import {
  composeReminders,
  renderRemindersYaml,
  writeRemindersFile,
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
  it("issue context: periodic context reminder plus a turn-limit wrap-up", () => {
    const entries = composeReminders(issueCtx(), {
      enableGitOps: true,
      memoryEnabled: false,
    });

    expect(entries.map((e) => e.name)).toEqual([
      "infer-action-context",
      "infer-action-wrap-up",
    ]);
    const [ctx, wrapUp] = entries;
    expect(ctx?.trigger).toBe("interval");
    expect(ctx?.interval).toBe(5);
    expect(ctx?.text).toContain("TodoWrite");
    expect(ctx?.text).toContain("gh pr create --draft");
    expect(wrapUp?.trigger).toBe("turns_before_max");
    expect(wrapUp?.threshold).toBe(10);
    expect(wrapUp?.text).toContain("draft PR exists");
  });

  it("PR context: wrap-up targets the existing PR", () => {
    const entries = composeReminders(prCtx(), {
      enableGitOps: true,
      memoryEnabled: false,
    });

    expect(entries[0]?.text).toContain("PR #112");
    expect(entries[1]?.text).toContain("PR #112 is up to date");
    expect(entries[1]?.text).not.toContain("gh pr create");
  });

  it("fork PR: view-only context reminder, no wrap-up", () => {
    const entries = composeReminders(prCtx({ isFork: true }), {
      enableGitOps: true,
      memoryEnabled: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toContain("CANNOT commit or push");
  });

  it("git ops off: a single todo-only reminder with no git wording", () => {
    const entries = composeReminders(issueCtx(), {
      enableGitOps: false,
      memoryEnabled: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toContain("TodoWrite");
    expect(entries[0]?.text).not.toContain("push");
    expect(entries[0]?.text).not.toContain("git");
  });

  it("memory enabled: adds the consult-once and hygiene reminders", () => {
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

describe("writeRemindersFile", () => {
  it("creates the directory and writes the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "reminders-test-"));
    const path = join(dir, "nested", "reminders.yaml");

    expect(writeRemindersFile("enabled: true\nreminders: []\n", path)).toBe(
      true,
    );
    expect(readFileSync(path, "utf8")).toContain("enabled: true");
  });
});

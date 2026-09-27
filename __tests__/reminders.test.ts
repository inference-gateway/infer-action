import { describe, expect, it } from "bun:test";
import type { TaskContext } from "../src/context.js";
import {
  asksForDemo,
  composeReminders,
  wrapUpThreshold,
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
    expect(wrapUp?.text).toContain("wip: <short description");
    expect(wrapUp?.text).toContain("remaining todos");
    expect(failedTool?.hook).toBe("post_tool");
    expect(failedTool?.trigger).toBe("on_failure");
    expect(failedTool?.text).toContain("did NOT happen");
    expect(failedTool?.text).toContain("failed call");
  });

  it("PR context: wrap-up targets the existing PR", () => {
    const entries = composeReminders(prCtx(), {
      enableGitOps: true,
    });

    expect(entries[0]?.text).toContain("PR #112");
    expect(entries[0]?.text).toContain("If you changed files");
    expect(entries[0]?.text).toContain(
      "Only reviewing or answering? Do not change, commit, or push anything.",
    );
    const wrapUp = entries.find((e) => e.name === "infer-action-wrap-up");
    expect(wrapUp?.text).toContain("PR #112 is up to date");
    expect(wrapUp?.text).toContain("If you changed nothing");
    expect(wrapUp?.text).not.toContain("gh pr create");
  });

  it("wrap-up threshold scales to 10% of max-turns with a floor of 10", () => {
    expect(wrapUpThreshold(0)).toBe(10);
    expect(wrapUpThreshold(50)).toBe(10);
    expect(wrapUpThreshold(150)).toBe(15);
    expect(wrapUpThreshold(300)).toBe(30);
    const entries = composeReminders(issueCtx(), {
      enableGitOps: true,
      maxTurns: 200,
    });
    const wrapUp = entries.find((e) => e.name === "infer-action-wrap-up");
    expect(wrapUp?.threshold).toBe(20);
  });

  it("fork PR: view-only context reminder, no wrap-up and no failed-tool nudge", () => {
    const entries = composeReminders(prCtx({ isFork: true }), {
      enableGitOps: true,
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
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toContain("TodoWrite");
    expect(entries[0]?.text).not.toContain("push");
    expect(entries[0]?.text).not.toContain("git");
    expect(
      entries.find((e) => e.name === "infer-action-failed-tool"),
    ).toBeUndefined();
  });

  it("record-demo: one post_stream nudge that fires when the agent first tries to finish", () => {
    const demo = composeReminders(issueCtx(), {
      enableGitOps: true,
      recordDemo: true,
    }).find((e) => e.name === "infer-action-record-demo");

    expect(demo?.hook).toBe("post_stream");
    expect(demo?.trigger).toBe("once");
    expect(demo?.text).toContain("RecordStart");
    expect(demo?.text).toContain("Call RecordStop yourself");
    expect(demo?.text).toContain("tmux send-keys -t demo");
    expect(demo?.text).toContain("write your complete final summary again");
  });

  it("record-demo off: no demo nudge in any context", () => {
    for (const ctx of [issueCtx(), prCtx(), prCtx({ isFork: true })]) {
      expect(
        composeReminders(ctx, { enableGitOps: true }).find(
          (e) => e.name === "infer-action-record-demo",
        ),
      ).toBeUndefined();
    }
  });
});

describe("asksForDemo", () => {
  it("matches a demo request in the direct prompt", () => {
    expect(
      asksForDemo({ kind: "direct", prompt: "Add --hello and create a demo" }),
    ).toBe(true);
    expect(asksForDemo({ kind: "direct", prompt: "Add --hello" })).toBe(false);
  });

  it("issue: the triggering comment wins over the issue text", () => {
    const issue = { ...issueCtx(), issueBody: "Please demo it" } as TaskContext;
    expect(asksForDemo(issue)).toBe(true);
    expect(
      asksForDemo({
        ...issue,
        triggeringComment: { id: 1, author: "u", body: "@infer fix the typo" },
      } as TaskContext),
    ).toBe(false);
  });

  it("PR: reads only the triggering comment, not older comments", () => {
    const comment = (body: string, isTrigger: boolean) => ({
      id: 1,
      author: "u",
      body,
      createdAt: "",
      isTrigger,
    });
    const pr = (comments: unknown[]) =>
      ({ ...prCtx(), comments }) as unknown as TaskContext;
    expect(
      asksForDemo(pr([comment("@infer demonstrate the new flag", true)])),
    ).toBe(true);
    expect(
      asksForDemo(
        pr([comment("nice demo", false), comment("@infer rebase", true)]),
      ),
    ).toBe(false);
  });

  it("does not match words that merely start with demo", () => {
    expect(asksForDemo({ kind: "direct", prompt: "fix democracy.go" })).toBe(
      false,
    );
  });
});

describe("renderRemindersYaml", () => {
  it("renders the schema the CLI expects, with JSON-quoted scalars", () => {
    const yaml = renderRemindersYaml(
      composeReminders(issueCtx(), {
        enableGitOps: true,
      }),
    );

    expect(yaml.startsWith("enabled: true\nmerge: true\nreminders:\n")).toBe(
      true,
    );
    expect(yaml).toContain('  - name: "infer-action-context"');
    expect(yaml).toContain('    hook: "pre_stream"');
    expect(yaml).toContain('    trigger: "interval"');
    expect(yaml).toContain("    interval: 5");
    expect(yaml).toContain("    threshold: 10");
    expect(yaml).toContain('  - name: "infer-action-failed-tool"');
    expect(yaml).toContain('    hook: "post_tool"');
    expect(yaml).toContain('    trigger: "on_failure"');
    for (const line of yaml.trimEnd().split("\n").slice(3)) {
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
      }),
    ).toBe(custom);
  });

  it("appends a trailing newline to verbatim YAML that lacks one", () => {
    const custom = "enabled: false\nreminders: []";
    expect(
      resolveRemindersYaml(custom, issueCtx(), {
        enableGitOps: true,
      }),
    ).toBe(custom + "\n");
  });

  it("treats whitespace-only reminders-config as empty and composes the default", () => {
    const yaml = resolveRemindersYaml("   \n  ", issueCtx(), {
      enableGitOps: true,
    });
    expect(yaml).toContain("infer-action-context");
    expect(yaml).toContain("infer-action-failed-tool");
  });

  it("composes the default when reminders-config is empty", () => {
    const yaml = resolveRemindersYaml("", issueCtx(), {
      enableGitOps: true,
    });
    expect(yaml).toContain("    interval: 5");
    expect(yaml).toContain("    threshold: 10");
  });
});

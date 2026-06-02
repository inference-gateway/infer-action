import { describe, expect, it } from "vitest";
import { loadContext } from "../src/context.js";
import type {
  GithubReader,
  IssueCommentSummary,
  PullRequestSummary,
} from "../src/github.js";

interface FakeReaderOptions {
  pr?: Partial<PullRequestSummary>;
  comments?: IssueCommentSummary[];
  owner?: string;
  repoName?: string;
}

function fakeReader(opts: FakeReaderOptions = {}): GithubReader {
  return {
    owner: opts.owner ?? "acme",
    repoName: opts.repoName ?? "widgets",
    async getPullRequest(): Promise<PullRequestSummary> {
      return {
        title: opts.pr?.title ?? "Some PR",
        body: opts.pr?.body ?? "PR description",
        headRef: opts.pr?.headRef ?? "feat/x",
        headRepoFullName: opts.pr?.headRepoFullName ?? "acme/widgets",
        baseRef: opts.pr?.baseRef ?? "main",
      };
    },
    async listIssueComments(): Promise<IssueCommentSummary[]> {
      return opts.comments ?? [];
    },
  };
}

describe("loadContext (issue)", () => {
  it("returns IssueContext without triggeringComment when comment env is empty", async () => {
    const ctx = await loadContext(
      {
        INFER_CONTEXT_KIND: "issue",
        INFER_ISSUE_NUMBER: "42",
        INFER_ISSUE_TITLE: "Bug: foo",
        INFER_ISSUE_BODY: "It breaks",
      },
      fakeReader(),
    );
    expect(ctx).toEqual({
      kind: "issue",
      issueNumber: 42,
      issueTitle: "Bug: foo",
      issueBody: "It breaks",
    });
  });

  it("populates triggeringComment when comment env vars are set", async () => {
    const ctx = await loadContext(
      {
        INFER_CONTEXT_KIND: "issue",
        INFER_ISSUE_NUMBER: "42",
        INFER_ISSUE_TITLE: "Bug",
        INFER_ISSUE_BODY: "It breaks",
        INFER_TRIGGERING_COMMENT_ID: "999",
        INFER_TRIGGERING_COMMENT_BODY: "@infer also do X",
        INFER_TRIGGERING_COMMENT_AUTHOR: "alice",
      },
      fakeReader(),
    );
    if (ctx.kind !== "issue") throw new Error("expected issue kind");
    expect(ctx.triggeringComment).toEqual({
      id: 999,
      body: "@infer also do X",
      author: "alice",
    });
  });

  it("ignores triggeringComment when id is 0 or body is empty", async () => {
    const ctx = await loadContext(
      {
        INFER_CONTEXT_KIND: "issue",
        INFER_ISSUE_NUMBER: "42",
        INFER_ISSUE_TITLE: "Bug",
        INFER_ISSUE_BODY: "It breaks",
        INFER_TRIGGERING_COMMENT_ID: "0",
        INFER_TRIGGERING_COMMENT_BODY: "",
        INFER_TRIGGERING_COMMENT_AUTHOR: "",
      },
      fakeReader(),
    );
    if (ctx.kind !== "issue") throw new Error("expected issue kind");
    expect(ctx.triggeringComment).toBeUndefined();
  });

  it("throws when INFER_ISSUE_NUMBER is missing", async () => {
    await expect(
      loadContext({ INFER_CONTEXT_KIND: "issue" }, fakeReader()),
    ).rejects.toThrow(/INFER_ISSUE_NUMBER/);
  });
});

describe("loadContext (direct)", () => {
  it("returns a DirectContext from INFER_DIRECT_PROMPT", async () => {
    const ctx = await loadContext(
      {
        INFER_CONTEXT_KIND: "direct",
        INFER_DIRECT_PROMPT: "Add a /healthz endpoint",
      },
      fakeReader(),
    );
    expect(ctx).toEqual({ kind: "direct", prompt: "Add a /healthz endpoint" });
  });

  it("trims surrounding whitespace from the prompt", async () => {
    const ctx = await loadContext(
      {
        INFER_CONTEXT_KIND: "direct",
        INFER_DIRECT_PROMPT: "  do the thing\n",
      },
      fakeReader(),
    );
    if (ctx.kind !== "direct") throw new Error("expected direct kind");
    expect(ctx.prompt).toBe("do the thing");
  });

  it("does not require an issue number", async () => {
    const ctx = await loadContext(
      { INFER_CONTEXT_KIND: "direct", INFER_DIRECT_PROMPT: "x" },
      fakeReader(),
    );
    expect(ctx.kind).toBe("direct");
  });

  it("throws when INFER_DIRECT_PROMPT is missing or blank", async () => {
    await expect(
      loadContext({ INFER_CONTEXT_KIND: "direct" }, fakeReader()),
    ).rejects.toThrow(/INFER_DIRECT_PROMPT/);
    await expect(
      loadContext(
        { INFER_CONTEXT_KIND: "direct", INFER_DIRECT_PROMPT: "   " },
        fakeReader(),
      ),
    ).rejects.toThrow(/INFER_DIRECT_PROMPT/);
  });
});

describe("loadContext (pull_request)", () => {
  it("assembles PullRequestContext and marks the triggering comment", async () => {
    const ctx = await loadContext(
      {
        INFER_CONTEXT_KIND: "pull_request",
        INFER_ISSUE_NUMBER: "112",
        INFER_TRIGGERING_COMMENT_ID: "5",
        INFER_TRIGGERING_COMMENT_BODY: "fix CI",
        INFER_TRIGGERING_COMMENT_AUTHOR: "bob",
      },
      fakeReader({
        pr: {
          title: "feat: walkthrough",
          body: "Adds a walkthrough.",
          headRef: "feat/walkthrough",
          baseRef: "main",
          headRepoFullName: "acme/widgets",
        },
        comments: [
          {
            id: 3,
            author: "alice",
            body: "looks good",
            createdAt: "2026-01-01T00:00:00Z",
          },
          {
            id: 5,
            author: "bob",
            body: "fix CI",
            createdAt: "2026-01-02T00:00:00Z",
          },
        ],
      }),
    );
    if (ctx.kind !== "pull_request") throw new Error("expected pr kind");
    expect(ctx.prNumber).toBe(112);
    expect(ctx.prTitle).toBe("feat: walkthrough");
    expect(ctx.headRef).toBe("feat/walkthrough");
    expect(ctx.baseRef).toBe("main");
    expect(ctx.isFork).toBe(false);
    expect(ctx.triggeringCommentId).toBe(5);
    expect(ctx.comments).toHaveLength(2);
    expect(ctx.comments[0]?.isTrigger).toBe(false);
    expect(ctx.comments[1]?.isTrigger).toBe(true);
  });

  it("sets isFork=true when head repo differs from action repo", async () => {
    const ctx = await loadContext(
      {
        INFER_CONTEXT_KIND: "pull_request",
        INFER_ISSUE_NUMBER: "112",
      },
      fakeReader({
        owner: "acme",
        repoName: "widgets",
        pr: { headRepoFullName: "contributor-fork/widgets" },
      }),
    );
    if (ctx.kind !== "pull_request") throw new Error("expected pr kind");
    expect(ctx.isFork).toBe(true);
  });

  it("treats empty headRepoFullName as non-fork", async () => {
    const ctx = await loadContext(
      {
        INFER_CONTEXT_KIND: "pull_request",
        INFER_ISSUE_NUMBER: "112",
      },
      fakeReader({ pr: { headRepoFullName: "" } }),
    );
    if (ctx.kind !== "pull_request") throw new Error("expected pr kind");
    expect(ctx.isFork).toBe(false);
  });
});

describe("loadContext (errors)", () => {
  it("throws when INFER_CONTEXT_KIND is missing", async () => {
    await expect(loadContext({}, fakeReader())).rejects.toThrow(
      /INFER_CONTEXT_KIND/,
    );
  });

  it("throws on unknown kind", async () => {
    await expect(
      loadContext(
        { INFER_CONTEXT_KIND: "discussion", INFER_ISSUE_NUMBER: "1" },
        fakeReader(),
      ),
    ).rejects.toThrow(/Unknown INFER_CONTEXT_KIND/);
  });
});

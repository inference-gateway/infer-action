import { describe, expect, it, spyOn } from "bun:test";
import { loadContext } from "../src/context.js";
import type {
  AssociatedPr,
  GithubReader,
  IssueCommentSummary,
  OpenPr,
  PullRequestSummary,
} from "../src/github.js";

interface FakeReaderOptions {
  pr?: Partial<PullRequestSummary>;
  comments?: IssueCommentSummary[];
  owner?: string;
  repoName?: string;
  openPrForBranch?: OpenPr | null;
  referencingPrs?: AssociatedPr[];
  onGetOpenPrForBranch?: (head: string) => void;
  failGather?: boolean;
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
    async getOpenPrForBranch(head: string): Promise<OpenPr | null> {
      opts.onGetOpenPrForBranch?.(head);
      return opts.openPrForBranch ?? null;
    },
    async findPrsReferencingIssue(): Promise<AssociatedPr[]> {
      if (opts.failGather) throw new Error("boom");
      return opts.referencingPrs ?? [];
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

  it("gathers and dedupes associated PRs/branches, querying fix/issue-N", async () => {
    let askedBranch = "";
    const ctx = await loadContext(
      {
        INFER_CONTEXT_KIND: "issue",
        INFER_ISSUE_NUMBER: "42",
        INFER_ISSUE_TITLE: "Bug",
        INFER_ISSUE_BODY: "It breaks",
      },
      fakeReader({
        onGetOpenPrForBranch: (head) => {
          askedBranch = head;
        },
        openPrForBranch: {
          number: 7,
          url: "https://github.com/acme/widgets/pull/7",
          body: "Resolves #42",
          baseRef: "main",
        },
        referencingPrs: [
          {
            number: 7,
            url: "https://github.com/acme/widgets/pull/7",
            state: "open",
            headRef: "",
            baseRef: "",
            isDraft: true,
            title: "fix: the bug",
          },
          {
            number: 9,
            url: "https://github.com/acme/widgets/pull/9",
            state: "closed",
            headRef: "",
            baseRef: "",
            isDraft: false,
            title: "old attempt",
          },
        ],
      }),
    );
    if (ctx.kind !== "issue") throw new Error("expected issue kind");
    expect(askedBranch).toBe("fix/issue-42");
    expect(ctx.associatedBranches).toEqual(["fix/issue-42"]);
    // #7 found via both sources appears once, merged: head/base from the branch
    // hit, draft/title from the timeline hit.
    expect(ctx.associatedPrs).toHaveLength(2);
    expect(ctx.associatedPrs?.find((p) => p.number === 7)).toMatchObject({
      number: 7,
      headRef: "fix/issue-42",
      baseRef: "main",
      isDraft: true,
      title: "fix: the bug",
    });
    expect(ctx.associatedPrs?.find((p) => p.number === 9)).toMatchObject({
      number: 9,
      state: "closed",
      headRef: "",
    });
  });

  it("omits association fields when nothing is associated", async () => {
    const ctx = await loadContext(
      {
        INFER_CONTEXT_KIND: "issue",
        INFER_ISSUE_NUMBER: "42",
        INFER_ISSUE_TITLE: "Bug",
        INFER_ISSUE_BODY: "It breaks",
      },
      fakeReader(),
    );
    expect(ctx).toEqual({
      kind: "issue",
      issueNumber: 42,
      issueTitle: "Bug",
      issueBody: "It breaks",
    });
  });

  it("is fail-soft when gathering existing work throws", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const ctx = await loadContext(
        {
          INFER_CONTEXT_KIND: "issue",
          INFER_ISSUE_NUMBER: "42",
          INFER_ISSUE_TITLE: "Bug",
          INFER_ISSUE_BODY: "It breaks",
        },
        fakeReader({ failGather: true }),
      );
      expect(ctx).toEqual({
        kind: "issue",
        issueNumber: 42,
        issueTitle: "Bug",
        issueBody: "It breaks",
      });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("failed to gather existing work for issue #42"),
        expect.anything(),
      );
    } finally {
      warn.mockRestore();
    }
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

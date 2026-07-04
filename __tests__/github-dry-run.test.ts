import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import type { GithubApiLike } from "../src/github-api.js";
import { GithubClient } from "../src/github.js";
import type { Redactor } from "../src/redact.js";
import { createRedactor } from "../src/redact.js";

// Minimal API double matching the surface GithubClient touches. Mirrors the
// harness in github-redact.test.ts (kept independent per file convention).
interface FakeApi {
  issues: {
    updateComment: ReturnType<typeof mock>;
    createComment: ReturnType<typeof mock>;
    getComment: ReturnType<typeof mock>;
    listEventsForTimeline: ReturnType<typeof mock>;
  };
  pulls: {
    update: ReturnType<typeof mock>;
    create: ReturnType<typeof mock>;
  };
  repos: {
    get: ReturnType<typeof mock>;
  };
}

function makeFakeApi(existingBody = ""): FakeApi {
  return {
    issues: {
      updateComment: mock().mockResolvedValue({}),
      createComment: mock().mockResolvedValue({}),
      getComment: mock().mockResolvedValue({ data: { body: existingBody } }),
      listEventsForTimeline: mock().mockResolvedValue({ data: [] }),
    },
    pulls: {
      update: mock().mockResolvedValue({}),
      create: mock().mockResolvedValue({
        data: {
          number: 7,
          html_url: "https://github.com/a/b/pull/7",
          body: "generated body",
          base: { ref: "main" },
        },
      }),
    },
    repos: {
      get: mock().mockResolvedValue({ data: { default_branch: "main" } }),
    },
  };
}

function makeClient(
  fake: FakeApi,
  opts: { dryRun?: boolean; redactor?: Redactor } = {},
): GithubClient {
  return new GithubClient({
    token: "x",
    repo: "a/b",
    api: fake as unknown as GithubApiLike,
    ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
    ...(opts.redactor ? { redactor: opts.redactor } : {}),
  });
}

describe("GithubClient dry-run", () => {
  let logs: string[];
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logs = [];
    spy = spyOn(console, "log").mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("createIssueComment simulates and never calls the API", async () => {
    const fake = makeFakeApi();
    const client = makeClient(fake, { dryRun: true });

    await client.createIssueComment(7, "hello world");

    expect(fake.issues.createComment).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain(
      "[dry-run] would create a github issue comment on issue #7",
    );
    expect(logs.join("\n")).toContain("hello world");
  });

  it("updateCommentBody simulates and never calls the API", async () => {
    const fake = makeFakeApi();
    const client = makeClient(fake, { dryRun: true });

    await client.updateCommentBody(42, "patched body");

    expect(fake.issues.updateComment).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("[dry-run] would update comment #42");
  });

  it("updatePullRequestBody simulates and never calls the API", async () => {
    const fake = makeFakeApi();
    const client = makeClient(fake, { dryRun: true });

    await client.updatePullRequestBody(123, "regenerated body");

    expect(fake.pulls.update).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("[dry-run] would update PR #123 body");
    expect(logs.join("\n")).toContain("regenerated body");
  });

  it("createDraftPr simulates and never calls the API", async () => {
    const fake = makeFakeApi();
    const client = makeClient(fake, { dryRun: true });

    const pr = await client.createDraftPr({
      head: "fix/issue-1",
      base: "main",
      title: "fix: resolve #1",
      body: "recovered work",
    });

    expect(fake.pulls.create).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain(
      "[dry-run] would open a DRAFT PR fix/issue-1 -> main",
    );
    expect(logs.join("\n")).toContain("recovered work");
    expect(pr.url).toBe("(dry-run)");
  });

  it("updateZone simulates WITHOUT reading the target comment", async () => {
    const fake = makeFakeApi("ignored existing body");
    const client = makeClient(fake, { dryRun: true });

    await client.updateZone(999999999, "plan", "the todos");

    expect(fake.issues.getComment).not.toHaveBeenCalled();
    expect(fake.issues.updateComment).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain(
      "[dry-run] would update the plan zone of comment #999999999",
    );
    expect(logs.join("\n")).toContain("the todos");
  });

  it("clearSpinner simulates without read or write", async () => {
    const fake = makeFakeApi("body with spinner");
    const client = makeClient(fake, { dryRun: true });

    await client.clearSpinner(1);

    expect(fake.issues.getComment).not.toHaveBeenCalled();
    expect(fake.issues.updateComment).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain(
      "[dry-run] would clear the spinner on comment #1",
    );
  });

  it("redacts secret values in the simulated body", async () => {
    const redactor = createRedactor({
      env: { GITHUB_TOKEN: "ghp_abcdefgh12345678" },
    });
    const client = makeClient(makeFakeApi(), { dryRun: true, redactor });

    await client.updateCommentBody(1, "leaked: ghp_abcdefgh12345678 done");

    const out = logs.join("\n");
    expect(out).toContain("***");
    expect(out).not.toContain("ghp_abcdefgh12345678");
  });

  it("reads still call through in dry-run", async () => {
    const fake = makeFakeApi("real body");
    const client = makeClient(fake, { dryRun: true });

    const body = await client.getCommentBody(5);

    expect(body).toBe("real body");
    expect(fake.issues.getComment).toHaveBeenCalled();
  });
});

describe("GithubClient createDraftPr / getDefaultBranch (live)", () => {
  it("createDraftPr opens a draft PR and maps the response to OpenPr", async () => {
    const fake = makeFakeApi();
    const client = makeClient(fake);

    const pr = await client.createDraftPr({
      head: "fix/issue-1",
      base: "main",
      title: "fix: resolve #1",
      body: "recovered work",
    });

    expect(fake.pulls.create).toHaveBeenCalledTimes(1);
    const arg = fake.pulls.create.mock.calls[0]![0];
    expect(arg).toMatchObject({
      owner: "a",
      repo: "b",
      head: "fix/issue-1",
      base: "main",
      title: "fix: resolve #1",
      body: "recovered work",
      draft: true,
    });
    expect(pr).toEqual({
      number: 7,
      url: "https://github.com/a/b/pull/7",
      body: "generated body",
      baseRef: "main",
    });
  });

  it("getDefaultBranch returns the repo default branch", async () => {
    const fake = makeFakeApi();
    fake.repos.get.mockResolvedValue({ data: { default_branch: "develop" } });
    const client = makeClient(fake);

    expect(await client.getDefaultBranch()).toBe("develop");
  });

  it("findPrsReferencingIssue maps cross-referenced PRs and skips non-PRs", async () => {
    const fake = makeFakeApi();
    fake.issues.listEventsForTimeline.mockResolvedValue({
      data: [
        { event: "labeled" },
        {
          event: "cross-referenced",
          source: {
            issue: {
              number: 5,
              html_url: "https://github.com/a/b/pull/5",
              title: "fix: thing",
              state: "open",
              draft: true,
              pull_request: { url: "https://api.github.com/.../pulls/5" },
            },
          },
        },
        {
          event: "cross-referenced",
          source: { issue: { number: 99, title: "a plain issue" } },
        },
      ],
    });
    const client = makeClient(fake);

    const prs = await client.findPrsReferencingIssue(42);

    expect(fake.issues.listEventsForTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "a", repo: "b", issue_number: 42 }),
    );
    expect(prs).toEqual([
      {
        number: 5,
        url: "https://github.com/a/b/pull/5",
        state: "open",
        headRef: "",
        baseRef: "",
        isDraft: true,
        title: "fix: thing",
      },
    ]);
  });

  it("reads (timeline) still call through in dry-run", async () => {
    const fake = makeFakeApi();
    fake.issues.listEventsForTimeline.mockResolvedValue({ data: [] });
    const client = makeClient(fake, { dryRun: true });

    await client.findPrsReferencingIssue(1);

    expect(fake.issues.listEventsForTimeline).toHaveBeenCalled();
  });
});

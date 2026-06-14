import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GithubClient } from "../src/github.js";
import { createRedactor } from "../src/redact.js";

// Minimal Octokit double matching the surface GithubClient touches. Mirrors the
// harness in github-redact.test.ts (kept independent per file convention).
interface FakeOctokit {
  issues: {
    updateComment: ReturnType<typeof vi.fn>;
    createComment: ReturnType<typeof vi.fn>;
    getComment: ReturnType<typeof vi.fn>;
  };
  pulls: {
    update: ReturnType<typeof vi.fn>;
  };
}

function makeFakeOctokit(existingBody = ""): FakeOctokit {
  return {
    issues: {
      updateComment: vi.fn().mockResolvedValue({}),
      createComment: vi.fn().mockResolvedValue({}),
      getComment: vi.fn().mockResolvedValue({ data: { body: existingBody } }),
    },
    pulls: {
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function injectOctokit(client: GithubClient, fake: FakeOctokit): void {
  (client as unknown as { octokit: FakeOctokit }).octokit = fake;
}

describe("GithubClient dry-run", () => {
  let logs: string[];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logs = [];
    spy = vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("createIssueComment simulates and never calls octokit", async () => {
    const client = new GithubClient({ token: "x", repo: "a/b", dryRun: true });
    const fake = makeFakeOctokit();
    injectOctokit(client, fake);

    await client.createIssueComment(7, "hello world");

    expect(fake.issues.createComment).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain(
      "[dry-run] would create a github issue comment on issue #7",
    );
    expect(logs.join("\n")).toContain("hello world");
  });

  it("updateCommentBody simulates and never calls octokit", async () => {
    const client = new GithubClient({ token: "x", repo: "a/b", dryRun: true });
    const fake = makeFakeOctokit();
    injectOctokit(client, fake);

    await client.updateCommentBody(42, "patched body");

    expect(fake.issues.updateComment).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("[dry-run] would update comment #42");
  });

  it("updatePullRequestBody simulates and never calls octokit", async () => {
    const client = new GithubClient({ token: "x", repo: "a/b", dryRun: true });
    const fake = makeFakeOctokit();
    injectOctokit(client, fake);

    await client.updatePullRequestBody(123, "regenerated body");

    expect(fake.pulls.update).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("[dry-run] would update PR #123 body");
    expect(logs.join("\n")).toContain("regenerated body");
  });

  it("updateZone simulates WITHOUT reading the target comment", async () => {
    const client = new GithubClient({ token: "x", repo: "a/b", dryRun: true });
    const fake = makeFakeOctokit("ignored existing body");
    injectOctokit(client, fake);

    await client.updateZone(999999999, "plan", "the todos");

    expect(fake.issues.getComment).not.toHaveBeenCalled();
    expect(fake.issues.updateComment).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain(
      "[dry-run] would update the plan zone of comment #999999999",
    );
    expect(logs.join("\n")).toContain("the todos");
  });

  it("clearSpinner simulates without read or write", async () => {
    const client = new GithubClient({ token: "x", repo: "a/b", dryRun: true });
    const fake = makeFakeOctokit("body with spinner");
    injectOctokit(client, fake);

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
    const client = new GithubClient({
      token: "x",
      repo: "a/b",
      redactor,
      dryRun: true,
    });
    injectOctokit(client, makeFakeOctokit());

    await client.updateCommentBody(1, "leaked: ghp_abcdefgh12345678 done");

    const out = logs.join("\n");
    expect(out).toContain("***");
    expect(out).not.toContain("ghp_abcdefgh12345678");
  });

  it("reads still call through in dry-run", async () => {
    const client = new GithubClient({ token: "x", repo: "a/b", dryRun: true });
    const fake = makeFakeOctokit("real body");
    injectOctokit(client, fake);

    const body = await client.getCommentBody(5);

    expect(body).toBe("real body");
    expect(fake.issues.getComment).toHaveBeenCalled();
  });
});

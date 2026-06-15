import { describe, expect, it, mock } from "bun:test";
import { GithubClient, PLAN_END, RESULT_START } from "../src/github.js";
import { createRedactor } from "../src/redact.js";

interface FakeOctokit {
  issues: {
    updateComment: ReturnType<typeof mock>;
    createComment: ReturnType<typeof mock>;
    getComment: ReturnType<typeof mock>;
  };
  pulls: {
    update: ReturnType<typeof mock>;
  };
}

function makeFakeOctokit(existingBody = ""): FakeOctokit {
  return {
    issues: {
      updateComment: mock().mockResolvedValue({}),
      createComment: mock().mockResolvedValue({}),
      getComment: mock().mockResolvedValue({ data: { body: existingBody } }),
    },
    pulls: {
      update: mock().mockResolvedValue({}),
    },
  };
}

function injectOctokit(client: GithubClient, fake: FakeOctokit): void {
  (client as unknown as { octokit: FakeOctokit }).octokit = fake;
}

describe("GithubClient redaction", () => {
  it("redacts secret values in updateCommentBody", async () => {
    const redactor = createRedactor({
      env: { GITHUB_TOKEN: "ghp_abcdefgh12345678" },
    });
    const client = new GithubClient({ token: "x", repo: "a/b", redactor });
    const fake = makeFakeOctokit();
    injectOctokit(client, fake);

    await client.updateCommentBody(1, "leaked: ghp_abcdefgh12345678 done");

    expect(fake.issues.updateComment).toHaveBeenCalledWith({
      owner: "a",
      repo: "b",
      comment_id: 1,
      body: "leaked: *** done",
    });
  });

  it("redacts secret values in createIssueComment", async () => {
    const redactor = createRedactor({
      env: { GITHUB_TOKEN: "ghp_abcdefgh12345678" },
    });
    const client = new GithubClient({ token: "x", repo: "a/b", redactor });
    const fake = makeFakeOctokit();
    injectOctokit(client, fake);

    await client.createIssueComment(
      7,
      "comment with ghp_abcdefgh12345678 inside",
    );

    expect(fake.issues.createComment).toHaveBeenCalledWith({
      owner: "a",
      repo: "b",
      issue_number: 7,
      body: "comment with *** inside",
    });
  });

  it("redacts secret values in updatePullRequestBody", async () => {
    const redactor = createRedactor({
      env: { GITHUB_TOKEN: "ghp_abcdefgh12345678" },
    });
    const client = new GithubClient({ token: "x", repo: "a/b", redactor });
    const fake = makeFakeOctokit();
    injectOctokit(client, fake);

    await client.updatePullRequestBody(
      9,
      "body with ghp_abcdefgh12345678 leak",
    );

    expect(fake.pulls.update).toHaveBeenCalledWith({
      owner: "a",
      repo: "b",
      pull_number: 9,
      body: "body with *** leak",
    });
  });

  it("redacts via updateZone, which routes through updateCommentBody", async () => {
    const redactor = createRedactor({
      env: { GITHUB_TOKEN: "ghp_abcdefgh12345678" },
    });
    const client = new GithubClient({ token: "x", repo: "a/b", redactor });
    const existing = `plan body\n\n${PLAN_END}\n\nmiddle\n\n${RESULT_START}\n\nold result`;
    const fake = makeFakeOctokit(existing);
    injectOctokit(client, fake);

    await client.updateZone(1, "result", "new ghp_abcdefgh12345678 leak");

    const calledWith = fake.issues.updateComment.mock.calls[0]?.[0] as {
      body: string;
    };
    expect(calledWith.body).not.toContain("ghp_abcdefgh12345678");
    expect(calledWith.body).toContain("***");
  });

  it("passes the body through unchanged when no redactor is configured", async () => {
    const client = new GithubClient({ token: "x", repo: "a/b" });
    const fake = makeFakeOctokit();
    injectOctokit(client, fake);

    await client.updateCommentBody(1, "this has ghp_abcdefgh12345678 token");

    expect(fake.issues.updateComment).toHaveBeenCalledWith({
      owner: "a",
      repo: "b",
      comment_id: 1,
      body: "this has ghp_abcdefgh12345678 token",
    });
  });
});

import { describe, expect, it, mock } from "bun:test";
import type { GithubApiLike } from "../src/github-api.js";
import { GithubClient, SPINNER_BLOCK } from "../src/github.js";

function makeFakeApi(existingBody = "") {
  return {
    issues: {
      getComment: mock().mockResolvedValue({ data: { body: existingBody } }),
      updateComment: mock().mockResolvedValue({}),
    },
    pulls: {
      getComment: mock().mockResolvedValue({ data: { body: existingBody } }),
      updateComment: mock().mockResolvedValue({}),
    },
  };
}

function makeClient(
  fake: ReturnType<typeof makeFakeApi>,
  reviewComment: boolean,
): GithubClient {
  return new GithubClient({
    token: "x",
    repo: "a/b",
    api: fake as unknown as GithubApiLike,
    reviewComment,
  });
}

describe("GithubClient review-comment mode", () => {
  it("routes updateZone through the pulls comment endpoints", async () => {
    const fake = makeFakeApi("plan body");
    const client = makeClient(fake, true);

    await client.updateZone(7, "result", "footer");

    expect(fake.pulls.getComment).toHaveBeenCalledWith({
      owner: "a",
      repo: "b",
      comment_id: 7,
    });
    expect(fake.pulls.updateComment).toHaveBeenCalledTimes(1);
    expect(fake.issues.getComment).not.toHaveBeenCalled();
    expect(fake.issues.updateComment).not.toHaveBeenCalled();
  });

  it("routes clearSpinner through the pulls comment endpoints", async () => {
    const fake = makeFakeApi(`${SPINNER_BLOCK}\n\nbody`);
    const client = makeClient(fake, true);

    await client.clearSpinner(7);

    expect(fake.pulls.updateComment).toHaveBeenCalledWith({
      owner: "a",
      repo: "b",
      comment_id: 7,
      body: "body",
    });
    expect(fake.issues.updateComment).not.toHaveBeenCalled();
  });

  it("keeps the issues endpoints when reviewComment is false", async () => {
    const fake = makeFakeApi("plan body");
    const client = makeClient(fake, false);

    await client.updateZone(7, "result", "footer");

    expect(fake.issues.getComment).toHaveBeenCalledTimes(1);
    expect(fake.issues.updateComment).toHaveBeenCalledTimes(1);
    expect(fake.pulls.getComment).not.toHaveBeenCalled();
    expect(fake.pulls.updateComment).not.toHaveBeenCalled();
  });
});

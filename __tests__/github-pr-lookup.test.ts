import { describe, expect, it, mock } from "bun:test";
import { GithubClient } from "../src/github.js";

// Minimal Octokit double for the pulls.list surface getPrForBranch touches.
// Kept independent per file convention (mirrors github-dry-run.test.ts).
interface FakeOctokit {
  pulls: {
    list: ReturnType<typeof mock>;
  };
}

interface ListedPr {
  number: number;
  html_url: string;
  body: string | null;
  base: { ref: string };
  state: string;
  merged_at: string | null;
}

function listedPr(over: Partial<ListedPr> = {}): ListedPr {
  return {
    number: 1,
    html_url: "https://github.com/o/r/pull/1",
    body: "body",
    base: { ref: "main" },
    state: "closed",
    merged_at: null,
    ...over,
  };
}

function makeClient(prs: ListedPr[]): {
  client: GithubClient;
  list: ReturnType<typeof mock>;
} {
  const client = new GithubClient({ token: "t", repo: "o/r" });
  const list = mock().mockResolvedValue({ data: prs });
  (client as unknown as { octokit: FakeOctokit }).octokit = {
    pulls: { list },
  };
  return { client, list };
}

describe("getPrForBranch", () => {
  it("queries all states for the owner-qualified head", async () => {
    const { client, list } = makeClient([]);

    const pr = await client.getPrForBranch("fix/issue-42");

    expect(pr).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
    const arg = list.mock.calls[0]![0];
    expect(arg.state).toBe("all");
    expect(arg.head).toBe("o:fix/issue-42");
  });

  it("prefers an open PR over merged and closed ones", async () => {
    const { client } = makeClient([
      listedPr({ number: 3, state: "closed", merged_at: "2026-01-01" }),
      listedPr({ number: 5, state: "open" }),
      listedPr({ number: 2, state: "closed" }),
    ]);

    const pr = await client.getPrForBranch("b");

    expect(pr).toEqual({
      number: 5,
      url: "https://github.com/o/r/pull/1",
      body: "body",
      baseRef: "main",
      state: "open",
      merged: false,
    });
  });

  it("prefers a merged PR over a closed-unmerged one", async () => {
    const { client } = makeClient([
      listedPr({ number: 2, state: "closed", merged_at: null }),
      listedPr({ number: 3, state: "closed", merged_at: "2026-01-01" }),
    ]);

    const pr = await client.getPrForBranch("b");

    expect(pr?.number).toBe(3);
    expect(pr?.state).toBe("closed");
    expect(pr?.merged).toBe(true);
  });

  it("falls back to the newest closed-unmerged PR", async () => {
    const { client } = makeClient([
      listedPr({ number: 8, state: "closed", merged_at: null }),
      listedPr({ number: 4, state: "closed", merged_at: null }),
    ]);

    const pr = await client.getPrForBranch("b");

    expect(pr?.number).toBe(8);
    expect(pr?.merged).toBe(false);
  });

  it("returns null when the branch has no PRs at all", async () => {
    const { client } = makeClient([]);

    expect(await client.getPrForBranch("b")).toBeNull();
  });
});

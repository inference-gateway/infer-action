import { describe, expect, it, mock } from "bun:test";
import type { GithubClient } from "../src/github.js";
import { linkPr } from "../src/recovery.js";

// linkPr now RETURNS the URL it linked — the report step relies on that return
// value to populate the footer's PR link (and the stopped-early "linked above"
// note). These lock that contract plus the zone the link lands in.
describe("linkPr", () => {
  it("returns the URL and writes it to the comment's middle zone", async () => {
    const updateZone = mock(async () => {});
    const github = { updateZone } as unknown as GithubClient;

    const url = await linkPr(
      github,
      "https://github.com/o/r/pull/7",
      true,
      123,
    );

    expect(url).toBe("https://github.com/o/r/pull/7");
    expect(updateZone).toHaveBeenCalledWith(
      123,
      "middle",
      expect.stringContaining("https://github.com/o/r/pull/7"),
    );
  });

  it("returns the URL without touching the comment in direct mode (no cooking comment)", async () => {
    const updateZone = mock(async () => {});
    const github = { updateZone } as unknown as GithubClient;

    const url = await linkPr(github, "https://github.com/o/r/pull/9", false, 0);

    expect(url).toBe("https://github.com/o/r/pull/9");
    expect(updateZone).not.toHaveBeenCalled();
  });
});

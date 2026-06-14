import { describe, expect, it } from "vitest";
import { buildPrBody, isThinPrBody } from "../src/pr-body.js";

describe("isThinPrBody", () => {
  it("treats a bare issue-linking line as thin", () => {
    expect(isThinPrBody("Fixes #67")).toBe(true);
    expect(isThinPrBody("Resolves #12")).toBe(true);
    expect(isThinPrBody("closes #3.")).toBe(true);
  });

  it("treats empty or whitespace-only bodies as thin", () => {
    expect(isThinPrBody("")).toBe(true);
    expect(isThinPrBody("   \n  ")).toBe(true);
  });

  it("treats a short blurb with no section heading as thin", () => {
    expect(isThinPrBody("wip")).toBe(true);
    expect(isThinPrBody("Fixes #67\n\nminor tweak")).toBe(true);
  });

  it("keeps a structured body with sections", () => {
    const body =
      "Resolves #1\n\n## Summary\n\nDid the thing.\n\n## Changes\n\n- a\n- b";
    expect(isThinPrBody(body)).toBe(false);
  });

  it("keeps a real one-line description (a full sentence)", () => {
    expect(
      isThinPrBody(
        "Removes the agent output tail section from the GitHub issue comment footer so results stay concise.",
      ),
    ).toBe(false);
  });
});

describe("buildPrBody", () => {
  it("renders issue link, summary, changes, and a diffstat", () => {
    const out = buildPrBody({
      commitSubjects: ["feat: add x", "test: cover x"],
      diffStat: " a.ts | 10 ++\n 1 file changed",
      issueNumber: 67,
    });
    expect(out).toContain("Resolves #67");
    expect(out).toContain("## Summary");
    expect(out).toContain("generated from the commit history");
    expect(out).toContain("## Changes");
    expect(out).toContain("- feat: add x");
    expect(out).toContain("- test: cover x");
    expect(out).toContain("<details><summary>Files changed</summary>");
    expect(out).toContain("a.ts | 10");
    // A backfilled body is, by construction, not thin.
    expect(isThinPrBody(out)).toBe(false);
  });

  it("omits the Resolves line when there is no issue number (direct runs)", () => {
    const out = buildPrBody({
      commitSubjects: ["chore: bump"],
      diffStat: "",
    });
    expect(out).not.toContain("Resolves #");
    expect(out).toContain("## Changes");
    expect(out).toContain("- chore: bump");
  });

  it("notes when no commits were found", () => {
    const out = buildPrBody({ commitSubjects: [], diffStat: "" });
    expect(out).toContain("(no commits found on this branch)");
  });

  it("omits the diffstat block when the stat is empty", () => {
    const out = buildPrBody({ commitSubjects: ["fix: y"], diffStat: "   " });
    expect(out).not.toContain("<details>");
  });
});

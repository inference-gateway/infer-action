import { describe, expect, it } from "vitest";
import { composeBashAllowAppend, GIT_WRITE_ALLOW } from "../src/bash-allow.js";

describe("composeBashAllowAppend", () => {
  it("appends the git-write commands when git operations are enabled", () => {
    const result = composeBashAllowAppend(true, "");
    expect(result).toBe(GIT_WRITE_ALLOW.join(","));
    expect(result).toContain("git commit( .*)?");
    expect(result).toContain("git push( .*)?");
    expect(result).toContain("git restore( .*)?");
    expect(result).toContain("git reset( .*)?");
    expect(result).toContain("git stash( .*)?");
    expect(result).toContain("gh pr create( .*)?");
    expect(result).toContain("gh pr ready( .*)?");
    expect(result).not.toContain("gh pr merge");
    expect(result).not.toContain("gh pr close");
    expect(result).not.toContain("gh pr edit");
    expect(result).not.toContain("gh pr review");
  });

  it("appends the consumer entries after the git-write commands", () => {
    const result = composeBashAllowAppend(true, "npm( .*)?,pnpm( .*)?");
    expect(result).toBe(`${GIT_WRITE_ALLOW.join(",")},npm( .*)?,pnpm( .*)?`);
  });

  it("omits the git-write commands when git operations are disabled", () => {
    expect(composeBashAllowAppend(false, "")).toBe("");
    expect(composeBashAllowAppend(false, "npm( .*)?")).toBe("npm( .*)?");
  });

  it("trims surrounding whitespace from the consumer input", () => {
    expect(composeBashAllowAppend(false, "  go test( .*)?  ")).toBe(
      "go test( .*)?",
    );
  });

  it("preserves newline-separated consumer input (the CLI splits on , and newline)", () => {
    const result = composeBashAllowAppend(false, "npm( .*)?\npnpm( .*)?");
    expect(result).toBe("npm( .*)?\npnpm( .*)?");
  });
});

import { describe, expect, it } from "bun:test";
import {
  composeBashAllowAppend,
  DEMO_RECORDING_ALLOW,
  GIT_WRITE_ALLOW,
} from "../src/bash-allow.js";

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
    expect(result).toContain(
      "gh pr edit( [0-9]+)? --(title|body|body-file)( .*)?",
    );
    expect(result).not.toContain("gh pr review");
  });

  it("allows resolving a review thread but no other GraphQL write", () => {
    const allowed = (command: string) =>
      GIT_WRITE_ALLOW.some((e) => new RegExp(`^(?:${e})$`, "s").test(command));
    const threads = `gh api graphql -f query='query{repository(owner:"o",name:"r"){pullRequest(number:1){reviewThreads(first:100){nodes{id isResolved comments(first:1){nodes{body}}}}}}}'`;
    const resolve = `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=PRRT_kwDOA1b2_-c3`;

    expect(allowed(threads)).toBe(true);
    expect(
      allowed(`${threads} --jq '.data | select(.isResolved | not) | .id'`),
    ).toBe(true);
    expect(allowed(resolve)).toBe(true);

    expect(
      allowed(
        `gh api graphql -f query='mutation{mergePullRequest(input:{pullRequestId:"x"}){clientMutationId}}'`,
      ),
    ).toBe(false);
    expect(
      allowed(
        `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}} closePullRequest(input:{pullRequestId:"x"}){clientMutationId}}' -f id=PRRT_x`,
      ),
    ).toBe(false);
    expect(allowed(`${threads} -f operationName=M`)).toBe(false);
    expect(allowed(`${resolve} -f query=x`)).toBe(false);
    expect(allowed(`gh api graphql -f query='query Q{a} mutation M{b}'`)).toBe(
      false,
    );
    expect(GIT_WRITE_ALLOW.filter((e) => e.includes(","))).toEqual([]);
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

  it("appends the tmux demo commands only when record-demo is on", () => {
    expect(composeBashAllowAppend(false, "")).not.toContain("tmux");
    expect(composeBashAllowAppend(false, "", true)).toBe(
      DEMO_RECORDING_ALLOW.join(","),
    );
    expect(composeBashAllowAppend(true, "npm( .*)?", true)).toBe(
      `${GIT_WRITE_ALLOW.join(",")},${DEMO_RECORDING_ALLOW.join(",")},npm( .*)?`,
    );
  });

  it("preserves newline-separated consumer input (the CLI splits on , and newline)", () => {
    const result = composeBashAllowAppend(false, "npm( .*)?\npnpm( .*)?");
    expect(result).toBe("npm( .*)?\npnpm( .*)?");
  });
});

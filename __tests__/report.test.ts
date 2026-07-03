import { describe, expect, it } from "bun:test";
import {
  buildFooter,
  type FooterArgs,
  formatCost,
  formatMoney,
  formatToolCalls,
} from "../src/report.js";
import { formatDuration } from "../src/duration.js";

function baseArgs(overrides: Partial<FooterArgs> = {}): FooterArgs {
  return {
    exitCode: "0",
    modelUsed: "mock/mock-v1",
    workflowUrl: "",
    durationMs: 0,
    actor: "tester",
    stoppedEarly: false,
    prUrl: "",
    agentResponse: "",
    failures: [],
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 0,
      toolCalls: 0,
    },
    ...overrides,
  };
}

describe("formatMoney", () => {
  it("renders USD with sub-cent precision", () => {
    expect(formatMoney(0.0008, "USD")).toBe("$0.0008");
  });

  it("pads to two fraction digits for round amounts", () => {
    expect(formatMoney(1.5, "USD")).toBe("$1.50");
  });

  it("trims trailing zeros above the two-digit minimum", () => {
    expect(formatMoney(0.678, "USD")).toBe("$0.678");
  });

  it("renders other ISO currencies with their symbol", () => {
    expect(formatMoney(0.0008, "EUR")).toBe("€0.0008");
  });

  it("falls back to amount + code for malformed currency codes", () => {
    expect(formatMoney(0.0008, "DOLLAR")).toBe("0.0008 DOLLAR");
  });
});

describe("formatCost", () => {
  it("mirrors the tokens line with input/output/total", () => {
    expect(
      formatCost({
        input: 0.678,
        output: 0.0021,
        total: 0.6801,
        currency: "USD",
      }),
    ).toBe("**Cost:** $0.678 in · $0.0021 out · $0.6801 total");
  });

  it("defaults a blank currency to USD", () => {
    expect(formatCost({ input: 1, output: 2, total: 3, currency: "" })).toBe(
      "**Cost:** $1.00 in · $2.00 out · $3.00 total",
    );
  });
});

describe("formatToolCalls", () => {
  it("reports 100% success when nothing failed", () => {
    expect(formatToolCalls(12, 0)).toBe(
      "**Tool calls:** 12 total · 100% success rate",
    );
  });

  it("rounds the success rate to a whole percent", () => {
    // 10 of 12 succeeded -> 83.33% -> 83%
    expect(formatToolCalls(12, 2)).toBe(
      "**Tool calls:** 12 total · 83% success rate",
    );
    // 7 of 8 succeeded -> 87.5% -> 88%
    expect(formatToolCalls(8, 1)).toBe(
      "**Tool calls:** 8 total · 88% success rate",
    );
  });

  it("reports 0% when every call failed", () => {
    expect(formatToolCalls(5, 5)).toBe(
      "**Tool calls:** 5 total · 0% success rate",
    );
  });

  it("clamps a failed count larger than the total to 0% (never negative)", () => {
    expect(formatToolCalls(3, 5)).toBe(
      "**Tool calls:** 3 total · 0% success rate",
    );
  });

  it("groups large totals with thousands separators", () => {
    expect(formatToolCalls(1234, 0)).toBe(
      "**Tool calls:** 1,234 total · 100% success rate",
    );
  });
});

describe("formatDuration", () => {
  it("renders seconds-only for <60s", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(59000)).toBe("59s");
  });

  it("renders minutes and seconds for <1h", () => {
    expect(formatDuration(60000)).toBe("1m 0s");
    expect(formatDuration(222000)).toBe("3m 42s");
    expect(formatDuration(3599000)).toBe("59m 59s");
  });

  it("renders hours, minutes, and seconds for >=1h", () => {
    expect(formatDuration(3600000)).toBe("1h 0m 0s");
    expect(formatDuration(3661000)).toBe("1h 1m 1s");
    expect(formatDuration(7500000)).toBe("2h 5m 0s");
  });
});

describe("buildFooter", () => {
  it("renders the agent response visibly between the header and the metadata", () => {
    const footer = buildFooter(
      baseArgs({ agentResponse: "Done. Added hello.txt with one line." }),
    );
    const headerIdx = footer.indexOf("## ✅ Infer Result: Success");
    const responseIdx = footer.indexOf("Done. Added hello.txt with one line.");
    const metaIdx = footer.indexOf("**Model:**");
    expect(headerIdx).toBeGreaterThanOrEqual(0);
    expect(responseIdx).toBeGreaterThan(headerIdx);
    expect(metaIdx).toBeGreaterThan(responseIdx);
    expect(footer).not.toMatch(/<details>[\s\S]*Done\. Added hello\.txt/);
    expect(footer).not.toContain("````");
  });

  it("omits the response section entirely when there is no final text", () => {
    const footer = buildFooter(baseArgs({ agentResponse: "" }));
    expect(footer).not.toContain("(response truncated)");
    expect(footer).toContain(
      "## ✅ Infer Result: Success\n\n**Model:** `mock/mock-v1`",
    );
  });

  it("treats a whitespace-only response as empty", () => {
    const footer = buildFooter(baseArgs({ agentResponse: "   \n  " }));
    expect(footer).toContain(
      "## ✅ Infer Result: Success\n\n**Model:** `mock/mock-v1`",
    );
  });

  it("still places the response above metadata under a failed-status header", () => {
    const footer = buildFooter(
      baseArgs({ exitCode: "1", agentResponse: "Ran into an error; see log." }),
    );
    const headerIdx = footer.indexOf("## ❌ Infer Result: Failed");
    const responseIdx = footer.indexOf("Ran into an error; see log.");
    const metaIdx = footer.indexOf("**Exit Code:** `1`");
    expect(headerIdx).toBeGreaterThanOrEqual(0);
    expect(responseIdx).toBeGreaterThan(headerIdx);
    expect(metaIdx).toBeGreaterThan(responseIdx);
  });

  it("preserves multi-line Markdown in the response", () => {
    const recap = "### What was accomplished\n\nReviewed PR #144.";
    const footer = buildFooter(baseArgs({ agentResponse: recap }));
    expect(footer).toContain(recap);
  });

  it("renders a ⚠️ Stopped early header (with a note) when flagged on an exit-0 run", () => {
    const footer = buildFooter(baseArgs({ stoppedEarly: true }));
    expect(footer).toContain("## ⚠️ Infer Result: Stopped early");
    expect(footer).toContain("some work may be incomplete");
    expect(footer).not.toContain("Infer Result: Success");
  });

  it("places the stopped-early note above the metadata", () => {
    const footer = buildFooter(baseArgs({ stoppedEarly: true }));
    const noteIdx = footer.indexOf("some work may be incomplete");
    const metaIdx = footer.indexOf("**Model:**");
    expect(noteIdx).toBeGreaterThanOrEqual(0);
    expect(metaIdx).toBeGreaterThan(noteIdx);
  });

  it("points to the pushed draft PR in the stopped-early note when a PR URL is present", () => {
    const footer = buildFooter(
      baseArgs({ stoppedEarly: true, prUrl: "https://github.com/o/r/pull/7" }),
    );
    expect(footer).toContain("some work may be incomplete");
    expect(footer).toContain("the draft pull request is linked above");
    expect(footer).not.toContain("did not open a pull request");
  });

  it("admits nothing was pushed in the stopped-early note when no PR URL is present", () => {
    const footer = buildFooter(baseArgs({ stoppedEarly: true, prUrl: "" }));
    expect(footer).toContain("some work may be incomplete");
    expect(footer).toContain("did not open a pull request");
    expect(footer).not.toContain("linked above");
  });

  it("keeps a non-zero exit as ❌ Failed even when stopped-early is set", () => {
    const footer = buildFooter(baseArgs({ exitCode: "1", stoppedEarly: true }));
    expect(footer).toContain("## ❌ Infer Result: Failed");
    expect(footer).not.toContain("Stopped early");
  });

  it("renders ⚠️ Stopped early with a time-limit note when timed out", () => {
    const footer = buildFooter(baseArgs({ timedOut: true, exitCode: "0" }));
    expect(footer).toContain("## ⚠️ Infer Result: Stopped early");
    expect(footer).toContain("hit the job's time limit");
    expect(footer).not.toContain("Infer Result: Success");
  });

  it("links the recovered draft PR in the timed-out note when a PR URL is present", () => {
    const footer = buildFooter(
      baseArgs({
        timedOut: true,
        exitCode: "0",
        prUrl: "https://github.com/o/r/pull/9",
      }),
    );
    expect(footer).toContain("hit the job's time limit");
    expect(footer).toContain("the draft pull request is linked above");
    expect(footer).not.toContain("No pull request was opened");
  });

  it("treats timed-out as ⚠️ even if an exit code leaked through (never ❌)", () => {
    const footer = buildFooter(baseArgs({ timedOut: true, exitCode: "1" }));
    expect(footer).toContain("## ⚠️ Infer Result: Stopped early");
    expect(footer).not.toContain("Infer Result: Failed");
  });

  it("stays ✅ Success when not flagged stopped-early", () => {
    const footer = buildFooter(baseArgs({ stoppedEarly: false }));
    expect(footer).toContain("## ✅ Infer Result: Success");
    expect(footer).not.toContain("Stopped early");
  });

  it("renders the salvaged note when exit-0 work was rescued into a PR", () => {
    const footer = buildFooter(
      baseArgs({
        stoppedEarly: true,
        salvaged: true,
        prUrl: "https://github.com/o/r/pull/7",
      }),
    );
    expect(footer).toContain("## ⚠️ Infer Result: Stopped early");
    expect(footer).toContain("finished without pushing its work");
    expect(footer).toContain("salvaged it into the pull request linked above");
  });

  it("salvaged without a PR points at the pushed branch instead", () => {
    const footer = buildFooter(
      baseArgs({ stoppedEarly: true, salvaged: true, prUrl: "" }),
    );
    expect(footer).toContain("salvaged it onto a pushed branch");
  });

  it("the timeout note wins over the salvaged note", () => {
    const footer = buildFooter(
      baseArgs({
        timedOut: true,
        salvaged: true,
        exitCode: "0",
        prUrl: "https://github.com/o/r/pull/7",
      }),
    );
    expect(footer).toContain("hit the job's time limit");
    expect(footer).not.toContain("finished without pushing");
  });

  it("a non-zero exit stays ❌ Failed even when salvaged", () => {
    const footer = buildFooter(
      baseArgs({ exitCode: "1", stoppedEarly: true, salvaged: true }),
    );
    expect(footer).toContain("## ❌ Infer Result: Failed");
    expect(footer).not.toContain("Stopped early");
  });

  it("renders failures as structured tool/message pairs", () => {
    const footer = buildFooter(
      baseArgs({
        failures: [
          { tool: "WebFetch", message: "blocked URL" },
          { tool: "Bash", message: "denied" },
        ],
      }),
    );
    expect(footer).toContain("- **WebFetch**: blocked URL");
    expect(footer).toContain("- **Bash**: denied");
    expect(footer).toContain("2 failed tool call(s)");
  });

  it("omits token and cost lines but keeps tool-call and failure sections in Claude Code mode", () => {
    const footer = buildFooter(
      baseArgs({
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          requests: 0,
          toolCalls: 5,
        },
        failures: [{ tool: "Bash", message: "denied" }],
      }),
    );
    expect(footer).not.toContain("**Tokens:**");
    expect(footer).not.toContain("**Cost:**");
    expect(footer).toContain("**Tool calls:** 5 total · 80% success rate");
    expect(footer).toContain("1 failed tool call(s)");
    expect(footer).toContain("- **Bash**: denied");
  });
});

import { describe, expect, it } from "bun:test";
import {
  buildJudgeDigest,
  buildJudgePrompt,
  formatVerdict,
  parseVerdict,
  type JudgeDigest,
} from "../src/judge.js";

function baseDigestInput() {
  return {
    result: "success",
    exitCode: "0",
    timedOut: false,
    stoppedEarly: false,
    durationMs: 12_000,
    usage: {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      requests: 2,
      toolCalls: 3,
    },
    toolCallCounts: {
      total: 3,
      perToolSuccess: { Bash: 2 },
      perToolError: { WebFetch: 1 },
    },
    failures: [{ tool: "WebFetch", message: "403 Forbidden", callId: "c1" }],
    loopSignal: {
      maxConsecutiveIdenticalToolCalls: 1,
      maxConsecutiveAssistantTurnsWithoutTools: 1,
    },
    stderrTail: "",
    finalResponse: "Done.",
  };
}

describe("buildJudgeDigest", () => {
  it("carries failures, counts, and loop signal through with caps applied", () => {
    const digest = buildJudgeDigest(baseDigestInput());
    expect(digest.failures).toEqual([
      { tool: "WebFetch", message: "403 Forbidden" },
    ]);
    expect(digest.toolCallCounts.perToolError["WebFetch"]).toBe(1);
    expect(digest.loopSignal.maxConsecutiveIdenticalToolCalls).toBe(1);
    expect(digest.finalResponseExcerpt).toBe("Done.");
  });

  it("caps failure count, message length, and response excerpt", () => {
    const digest = buildJudgeDigest({
      ...baseDigestInput(),
      failures: Array.from({ length: 30 }, (_, i) => ({
        tool: "Bash",
        message: "x".repeat(1000) + i,
      })),
      finalResponse: "y".repeat(5000),
    });
    expect(digest.failures.length).toBe(20);
    expect(digest.failures[0]?.message.length).toBe(500);
    expect(digest.finalResponseExcerpt.length).toBe(2000);
  });

  it("serializes failures before the rest of the digest", () => {
    const json = JSON.stringify(buildJudgeDigest(baseDigestInput()));
    expect(json.indexOf('"failures"')).toBeLessThan(json.indexOf('"usage"'));
  });
});

describe("buildJudgePrompt", () => {
  it("embeds the digest and demands the JSON verdict shape", () => {
    const prompt = buildJudgePrompt(
      buildJudgeDigest(baseDigestInput()) as JudgeDigest,
    );
    expect(prompt).toContain("403 Forbidden");
    expect(prompt).toContain('"score": "ok" | "degraded" | "blocked"');
    expect(prompt).toContain("failures");
  });
});

describe("parseVerdict", () => {
  it("parses a plain JSON verdict", () => {
    expect(
      parseVerdict('{"score":"ok","blockers":[],"improvements":[]}'),
    ).toEqual({ score: "ok", blockers: [], improvements: [] });
  });

  it("parses a fenced verdict with surrounding prose", () => {
    const text =
      'Here is my verdict:\n```json\n{"score":"blocked","blockers":["403 on every gh call"],"improvements":["grant pull-requests: write"]}\n```';
    expect(parseVerdict(text)).toEqual({
      score: "blocked",
      blockers: ["403 on every gh call"],
      improvements: ["grant pull-requests: write"],
    });
  });

  it("caps improvements at 3 and drops non-string entries", () => {
    const v = parseVerdict(
      '{"score":"degraded","blockers":[42],"improvements":["a","b","c","d"]}',
    );
    expect(v?.blockers).toEqual([]);
    expect(v?.improvements).toEqual(["a", "b", "c"]);
  });

  it("returns null on malformed JSON, wrong shape, or no JSON", () => {
    expect(parseVerdict("{not json")).toBeNull();
    expect(parseVerdict('{"score":"great"}')).toBeNull();
    expect(parseVerdict("all good, no findings")).toBeNull();
  });
});

describe("formatVerdict", () => {
  it("renders blockers and improvements", () => {
    const md = formatVerdict({
      score: "blocked",
      blockers: ["permission denied"],
      improvements: ["add token scope"],
    });
    expect(md).toContain("Run judge: ⛔ blocked");
    expect(md).toContain("- permission denied");
    expect(md).toContain("- add token scope");
  });

  it("renders 'No findings.' for a clean ok verdict", () => {
    const md = formatVerdict({ score: "ok", blockers: [], improvements: [] });
    expect(md).toContain("✅ ok");
    expect(md).toContain("No findings.");
  });
});

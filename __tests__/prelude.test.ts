import { afterEach, describe, expect, mock, test } from "bun:test";
import type { GithubReader } from "../src/github.js";
import {
  AGENT_OUTPUT_PATH,
  CANCEL_MARKER_PATH,
  TODOS_PATH,
  loadContextOrFallback,
  optional,
  required,
} from "../src/prelude.js";

// bun:test has no vi.stubEnv; save/restore process.env by hand (same
// convention as prompts.test.ts).
const SAVED = { ...process.env };
afterEach(() => {
  process.env = { ...SAVED };
});

describe("temp-file path constants", () => {
  test("match the paths action.yml and the cleanup step reference", () => {
    expect(AGENT_OUTPUT_PATH).toBe("/tmp/agent-output.txt");
    expect(TODOS_PATH).toBe("/tmp/infer-todos.json");
    expect(CANCEL_MARKER_PATH).toBe("/tmp/infer-cancelled");
  });
});

describe("required", () => {
  test("returns the value when set", () => {
    process.env["PRELUDE_TEST_VAR"] = "value";
    expect(required("PRELUDE_TEST_VAR")).toBe("value");
  });

  test("throws when missing", () => {
    delete process.env["PRELUDE_TEST_VAR"];
    expect(() => required("PRELUDE_TEST_VAR")).toThrow(
      "Missing required env var PRELUDE_TEST_VAR",
    );
  });

  test("throws when empty", () => {
    process.env["PRELUDE_TEST_VAR"] = "";
    expect(() => required("PRELUDE_TEST_VAR")).toThrow(
      "Missing required env var PRELUDE_TEST_VAR",
    );
  });
});

describe("optional", () => {
  test("returns the value when set", () => {
    process.env["PRELUDE_TEST_VAR"] = "value";
    expect(optional("PRELUDE_TEST_VAR")).toBe("value");
  });

  test("defaults to empty string when missing", () => {
    delete process.env["PRELUDE_TEST_VAR"];
    expect(optional("PRELUDE_TEST_VAR")).toBe("");
  });
});

// A reader whose methods are never reached: the tests drive loadContext to
// throw before any network read (missing INFER_CONTEXT_KIND).
const unusedReader = {} as GithubReader;

describe("loadContextOrFallback", () => {
  test("rethrows the load error when failHard is set", async () => {
    delete process.env["INFER_CONTEXT_KIND"];
    await expect(
      loadContextOrFallback(process.env, unusedReader, {
        stepName: "dry-run",
        failHard: true,
      }),
    ).rejects.toThrow("Missing required env var INFER_CONTEXT_KIND");
  });

  test("falls back to env-derived context with a step-prefixed warning", async () => {
    delete process.env["INFER_CONTEXT_KIND"];
    process.env["INFER_ISSUE_NUMBER"] = "42";
    process.env["INFER_ISSUE_TITLE"] = "salvage me";
    const warn = console.warn;
    const warned: string[] = [];
    console.warn = mock((msg: string) => {
      warned.push(msg);
    });
    try {
      const ctx = await loadContextOrFallback(process.env, unusedReader, {
        stepName: "salvage",
      });
      expect(ctx).toEqual({
        kind: "issue",
        issueNumber: 42,
        issueTitle: "salvage me",
        issueBody: "",
      });
      expect(warned).toHaveLength(1);
      expect(warned[0]).toStartWith("[salvage] context read failed (");
      expect(warned[0]).toEndWith("); proceeding with env-derived data");
    } finally {
      console.warn = warn;
    }
  });

  test("returns the loaded context untouched on success", async () => {
    process.env["INFER_CONTEXT_KIND"] = "direct";
    process.env["INFER_DIRECT_PROMPT"] = "do the thing";
    const ctx = await loadContextOrFallback(process.env, unusedReader, {
      stepName: "report",
    });
    expect(ctx).toEqual({ kind: "direct", prompt: "do the thing" });
  });
});

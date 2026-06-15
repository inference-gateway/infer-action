import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { extractFailures } from "../src/failures.js";

const REAL_LOG_PATH =
  "/Users/edenreich/.claude/projects/-Users-edenreich-Repositories-inference-gateway-adks-typescript-adk/841893b2-96bd-41f6-ad05-9ce9b7ade47f/tool-results/bl7j30zuy.txt";

describe.skipIf(!existsSync(REAL_LOG_PATH))(
  "real run log replay (skipped if log not present)",
  () => {
    it("extracts the four URL-validation failures with the WebFetch tool name", async () => {
      const raw = readFileSync(REAL_LOG_PATH, "utf8");
      const stripped = raw
        .split("\n")
        .map((l) => l.replace(/^infer\tRun Infer Agent\t[0-9TZ:.-]+ /, ""))
        .filter((l) => l.startsWith("{"))
        .join("\n");
      const dir = mkdtempSync(join(tmpdir(), "infer-real-log-"));
      const path = join(dir, "agent-output.txt");
      writeFileSync(path, stripped);

      const failures = await extractFailures(path);

      // The captured log only has `role:"tool"` rows (no preceding assistant
      // tool_calls), so name correlation falls back to "unknown" - that is
      // expected for this fixture. The important assertion is that all four
      // URL-validation failures are extracted with a real error message
      // (i.e. no empty rows, which was the screenshot's bug).
      expect(failures.length).toBe(4);
      for (const f of failures) {
        expect(f).toMatch(/URL validation failed: domain not whitelisted/);
      }
    });
  },
);

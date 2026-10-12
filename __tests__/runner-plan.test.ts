import { describe, expect, it } from "bun:test";
import { renderPlan } from "../src/runner.js";
import { SPINNER_BLOCK, stripSpinner } from "../src/github.js";
import { readRunMeta, renderRunMeta } from "../src/run-meta.js";
import type { Todo } from "../src/types.js";

const META = {
  model: "ollama_cloud/glm-5.2",
  actionVersion: "v0.56.0",
  cliVersion: "v0.229.0",
  workflowUrl: "https://github.com/acme/widgets/actions/runs/42",
};
const HEADER =
  "**Model:** `ollama_cloud/glm-5.2` · **Action:** [`v0.56.0`](https://github.com/inference-gateway/infer-action/releases/tag/v0.56.0) · **CLI:** `v0.229.0` · [View Job](https://github.com/acme/widgets/actions/runs/42)";

const TODOS: Todo[] = [
  { id: "1", content: "Read codebase", status: "completed" },
  { id: "2", content: "Write tests", status: "in_progress" },
  { id: "3", content: "Rebuild dist/", status: "pending" },
];

describe("renderRunMeta", () => {
  it("renders model, action, cli and job link in one line", () => {
    expect(renderRunMeta(META)).toBe(HEADER);
  });

  it("omits unset parts and links a pinned SHA to its commit", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const out = renderRunMeta({
      ...META,
      actionVersion: sha,
      cliVersion: "",
      workflowUrl: "",
    });
    expect(out).toBe(
      `**Model:** \`${META.model}\` · **Action:** [\`${sha}\`](https://github.com/inference-gateway/infer-action/commit/${sha})`,
    );
  });

  it("reads versions and job url from the step env", () => {
    const env = {
      INFER_ACTION_VERSION: META.actionVersion,
      INFER_CLI_VERSION: META.cliVersion,
      INFER_WORKFLOW_URL: META.workflowUrl,
    };
    expect(readRunMeta(env, META.model)).toEqual(META);
    expect(readRunMeta({}, META.model)).toEqual({
      model: META.model,
      actionVersion: "",
      cliVersion: "",
      workflowUrl: "",
    });
  });
});

describe("renderPlan", () => {
  it("pins the run meta below the spinner, above the todos", () => {
    const out = renderPlan(TODOS, META);
    expect(out.startsWith(`${SPINNER_BLOCK}\n\n${HEADER}\n\n### Todos`)).toBe(
      true,
    );
    expect(out).toContain("- [x] Read codebase");
    expect(out).toContain("- [~] Write tests");
    expect(out).toContain("- [ ] Rebuild dist/");
  });

  it("keeps the run meta when the agent has not posted todos yet", () => {
    const out = renderPlan([], META);
    expect(out).toContain(HEADER);
    expect(out).toContain("_(agent has not posted a plan yet)_");
  });

  it("survives the end-of-run spinner clear", () => {
    const stripped = stripSpinner(renderPlan(TODOS, META));
    expect(stripped.startsWith(HEADER)).toBe(true);
  });
});

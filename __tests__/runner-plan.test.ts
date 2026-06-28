import { describe, expect, it } from "bun:test";
import { renderPlan } from "../src/runner.js";
import { SPINNER_BLOCK, stripSpinner } from "../src/github.js";
import type { Todo } from "../src/types.js";

const WORKFLOW_URL = "https://github.com/acme/widgets/actions/runs/42";
const MODEL = "ollama_cloud/glm-5.2";

const TODOS: Todo[] = [
  { id: "1", content: "Read codebase", status: "completed" },
  { id: "2", content: "Write tests", status: "in_progress" },
  { id: "3", content: "Rebuild dist/", status: "pending" },
];

describe("renderPlan", () => {
  it("pins the model and View Job link below the spinner, above the todos", () => {
    const out = renderPlan(TODOS, WORKFLOW_URL, MODEL);
    expect(out).toContain(SPINNER_BLOCK);
    expect(out).toContain(`**Model:** \`${MODEL}\``);
    expect(out).toContain(`[View Job](${WORKFLOW_URL})`);
    expect(out).toContain("### Todos");
    expect(out).toContain("- [x] Read codebase");
    expect(out).toContain("- [~] Write tests");
    expect(out).toContain("- [ ] Rebuild dist/");
    // The header is pinned at the top, so it never scrolls away behind the plan.
    expect(out.indexOf("**Model:**")).toBeLessThan(out.indexOf("### Todos"));
    expect(out.indexOf("[View Job]")).toBeLessThan(out.indexOf("### Todos"));
  });

  it("keeps the model and View Job link when the agent has not posted todos yet", () => {
    const out = renderPlan([], WORKFLOW_URL, MODEL);
    expect(out).toContain(`**Model:** \`${MODEL}\``);
    expect(out).toContain(`[View Job](${WORKFLOW_URL})`);
    expect(out).toContain("_(agent has not posted a plan yet)_");
  });

  it("still shows the model when no workflow URL is available", () => {
    expect(renderPlan(TODOS, "", MODEL)).toContain(`**Model:** \`${MODEL}\``);
    expect(renderPlan([], "", MODEL)).toContain(`**Model:** \`${MODEL}\``);
    // The link is omitted gracefully, but the model stays.
    expect(renderPlan(TODOS, "", MODEL)).not.toContain("View Job");
    expect(renderPlan([], "", MODEL)).not.toContain("View Job");
  });

  it("survives the end-of-run spinner clear (model + link outlive the spinner)", () => {
    const stripped = stripSpinner(renderPlan(TODOS, WORKFLOW_URL, MODEL));
    expect(stripped).not.toContain("infer:spinner");
    expect(stripped).toContain(`**Model:** \`${MODEL}\``);
    expect(stripped).toContain(`[View Job](${WORKFLOW_URL})`);
    expect(stripped).toContain("- [x] Read codebase");
  });
});

import { describe, expect, it } from "bun:test";
import { renderPlan } from "../src/runner.js";
import { SPINNER_BLOCK, stripSpinner } from "../src/github.js";
import type { Todo } from "../src/types.js";

const WORKFLOW_URL = "https://github.com/acme/widgets/actions/runs/42";

const TODOS: Todo[] = [
  { id: "1", content: "Read codebase", status: "completed" },
  { id: "2", content: "Write tests", status: "in_progress" },
  { id: "3", content: "Rebuild dist/", status: "pending" },
];

describe("renderPlan", () => {
  it("pins the View Job link below the spinner, above the todos", () => {
    const out = renderPlan(TODOS, WORKFLOW_URL);
    expect(out).toContain(SPINNER_BLOCK);
    expect(out).toContain(`[View Job](${WORKFLOW_URL})`);
    expect(out).toContain("### Todos");
    expect(out).toContain("- [x] Read codebase");
    expect(out).toContain("- [~] Write tests");
    expect(out).toContain("- [ ] Rebuild dist/");
    // The link is pinned at the top, so it never scrolls away behind the plan.
    expect(out.indexOf("[View Job]")).toBeLessThan(out.indexOf("### Todos"));
  });

  it("keeps the View Job link when the agent has not posted todos yet", () => {
    const out = renderPlan([], WORKFLOW_URL);
    expect(out).toContain(`[View Job](${WORKFLOW_URL})`);
    expect(out).toContain("_(agent has not posted a plan yet)_");
  });

  it("omits the link gracefully when no workflow URL is available", () => {
    expect(renderPlan(TODOS, "")).not.toContain("View Job");
    expect(renderPlan([], "")).not.toContain("View Job");
  });

  it("survives the end-of-run spinner clear (link outlives the spinner)", () => {
    const stripped = stripSpinner(renderPlan(TODOS, WORKFLOW_URL));
    expect(stripped).not.toContain("infer:spinner");
    expect(stripped).toContain(`[View Job](${WORKFLOW_URL})`);
    expect(stripped).toContain("- [x] Read codebase");
  });
});

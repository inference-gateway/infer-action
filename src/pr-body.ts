// Detects a PR body the agent left too thin to be useful, and synthesizes a
// real one from the commit log as a model-independent backstop. The agent is
// instructed to write a proper ## Summary / ## Changes body (see the system
// prompts), but weaker models sometimes collapse it to a bare "Fixes #N";
// when that happens the runner regenerates the body via this module.

// A standalone issue-linking line such as "Fixes #67" / "Resolves #12.".
const LINK_ONLY_LINE = /^(resolves|closes|fixes)\s+#\d+\.?$/i;

// A body is "thin" when, after dropping any issue-linking line and surrounding
// whitespace, nothing of substance remains: empty, or a short blurb with no
// markdown section heading. Kept conservative so a real one-line description
// (a full sentence) is left untouched.
export function isThinPrBody(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return true;
  const withoutLink = trimmed
    .split("\n")
    .filter((line) => !LINK_ONLY_LINE.test(line.trim()))
    .join("\n")
    .trim();
  if (!withoutLink) return true;
  return withoutLink.length < 40 && !withoutLink.includes("##");
}

export interface BuildPrBodyInput {
  commitSubjects: string[];
  diffStat: string;
  issueNumber?: number | undefined;
  note?: string | undefined;
}

// Renders a structured PR body from the commit history. Mirrors the shape the
// system prompt asks the agent for (issue-linking line + ## Summary + ## Changes)
// so a backfilled PR reads like an agent-authored one, with an explicit note
// that it was generated.
export function buildPrBody(input: BuildPrBodyInput): string {
  const lines: string[] = [];
  if (input.issueNumber) {
    lines.push(`Resolves #${input.issueNumber}`, "");
  }
  lines.push(
    "## Summary",
    "",
    input.note ??
      "_The agent's original PR description was incomplete, so this summary was generated from the commit history._",
    "",
    "## Changes",
    "",
  );
  const subjects = input.commitSubjects
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (subjects.length > 0) {
    for (const subject of subjects) lines.push(`- ${subject}`);
  } else {
    lines.push("- (no commits found on this branch)");
  }
  const diffStat = input.diffStat.trim();
  if (diffStat) {
    lines.push(
      "",
      "<details><summary>Files changed</summary>",
      "",
      "```",
      diffStat,
      "```",
      "",
      "</details>",
    );
  }
  return lines.join("\n");
}

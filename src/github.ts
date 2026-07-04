import { GithubApi, type GithubApiLike } from "./github-api.js";
import type { Redactor } from "./redact.js";

export const PLAN_END = "<!-- infer:plan-end -->";
export const RESULT_START = "<!-- infer:result-start -->";

// Sentinels that wrap the "working" spinner so it has one deterministic home at
// the top of the comment and can be stripped cleanly when the run finishes.
export const SPINNER_START = "<!-- infer:spinner -->";
export const SPINNER_END = "<!-- /infer:spinner -->";

// The loading indicator pinned to the top of the cooking comment for the whole
// run. The runner re-emits it on every plan update (see renderPlan) so a
// TodoWrite never erases it, and post-results removes it on always() via
// clearSpinner. NOTE: keep this byte-identical to the COOKING_MESSAGE spinner
// literal in action.yml - both render the same indicator before the runner starts.
export const SPINNER_BLOCK = `${SPINNER_START}<img src="https://raw.githubusercontent.com/inference-gateway/infer-action/main/assets/spinner.svg" width="22" height="22" alt="Working" />${SPINNER_END}`;

// Removes the spinner block (and any blank line trailing it) from a comment
// body, wherever it sits. Returns the body unchanged if no spinner is present.
export function stripSpinner(body: string): string {
  const start = body.indexOf(SPINNER_START);
  if (start === -1) return body;
  const endMarker = body.indexOf(SPINNER_END, start);
  if (endMarker === -1) return body;
  let tail = endMarker + SPINNER_END.length;
  while (tail < body.length && (body[tail] === "\n" || body[tail] === "\r")) {
    tail++;
  }
  return body.slice(0, start) + body.slice(tail);
}

export interface Zones {
  plan: string;
  middle: string;
  result: string;
}

export function splitZones(body: string): Zones {
  const planEndIdx = body.indexOf(PLAN_END);
  const resultStartIdx = body.indexOf(RESULT_START);

  if (planEndIdx === -1 && resultStartIdx === -1) {
    return { plan: body, middle: "", result: "" };
  }
  if (planEndIdx === -1) {
    return {
      plan: body.slice(0, resultStartIdx),
      middle: "",
      result: body.slice(resultStartIdx + RESULT_START.length),
    };
  }
  if (resultStartIdx === -1) {
    return {
      plan: body.slice(0, planEndIdx),
      middle: body.slice(planEndIdx + PLAN_END.length),
      result: "",
    };
  }
  return {
    plan: body.slice(0, planEndIdx),
    middle: body.slice(planEndIdx + PLAN_END.length, resultStartIdx),
    result: body.slice(resultStartIdx + RESULT_START.length),
  };
}

export function joinZones(zones: Zones): string {
  const plan = zones.plan.trim();
  const middle = zones.middle.trim();
  const result = zones.result.trim();

  if (!middle && !result) return plan;

  let body = plan;
  body += `\n\n${PLAN_END}`;
  if (middle) body += `\n\n${middle}`;
  body += `\n\n${RESULT_START}`;
  if (result) body += `\n\n${result}`;
  return body;
}

export interface GithubClientOptions {
  token: string;
  repo: string;
  redactor?: Redactor;
  dryRun?: boolean;
  api?: GithubApiLike;
}

export class GithubClient {
  private readonly api: GithubApiLike;
  private readonly redactor: Redactor | undefined;
  private readonly dryRun: boolean;
  readonly owner: string;
  readonly repoName: string;

  constructor(opts: GithubClientOptions) {
    this.api = opts.api ?? new GithubApi({ token: opts.token });
    this.redactor = opts.redactor;
    this.dryRun = opts.dryRun ?? false;
    const [owner, name] = opts.repo.split("/");
    if (!owner || !name) {
      throw new Error(
        `Invalid repo string "${opts.repo}", expected "owner/name"`,
      );
    }
    this.owner = owner;
    this.repoName = name;
  }

  private commentUrl(commentId: number): string {
    return `https://github.com/${this.owner}/${this.repoName}/issues/comments/${commentId}`;
  }

  private issueUrl(issueNumber: number): string {
    return `https://github.com/${this.owner}/${this.repoName}/issues/${issueNumber}`;
  }

  private prUrl(prNumber: number): string {
    return `https://github.com/${this.owner}/${this.repoName}/pull/${prNumber}`;
  }

  async getCommentBody(commentId: number): Promise<string> {
    const res = await this.api.issues.getComment({
      owner: this.owner,
      repo: this.repoName,
      comment_id: commentId,
    });
    return res.data.body ?? "";
  }

  async updateCommentBody(commentId: number, body: string): Promise<void> {
    const safeBody = this.redactor ? this.redactor.redact(body) : body;
    if (this.dryRun) {
      console.log(
        `[dry-run] would update comment #${commentId} (${this.commentUrl(commentId)}):\n${safeBody}`,
      );
      return;
    }
    await this.api.issues.updateComment({
      owner: this.owner,
      repo: this.repoName,
      comment_id: commentId,
      body: safeBody,
    });
  }

  async createIssueComment(issueNumber: number, body: string): Promise<void> {
    const safeBody = this.redactor ? this.redactor.redact(body) : body;
    if (this.dryRun) {
      console.log(
        `[dry-run] would create a github issue comment on issue #${issueNumber} (${this.issueUrl(issueNumber)}):\n${safeBody}`,
      );
      return;
    }
    await this.api.issues.createComment({
      owner: this.owner,
      repo: this.repoName,
      issue_number: issueNumber,
      body: safeBody,
    });
  }

  async updateZone(
    commentId: number,
    zone: keyof Zones,
    newContent: string,
  ): Promise<void> {
    if (this.dryRun) {
      const safe = this.redactor
        ? this.redactor.redact(newContent)
        : newContent;
      console.log(
        `[dry-run] would update the ${zone} zone of comment #${commentId} (${this.commentUrl(commentId)}):\n${safe}`,
      );
      return;
    }
    const body = await this.getCommentBody(commentId);
    const zones = splitZones(body);
    zones[zone] = newContent;
    await this.updateCommentBody(commentId, joinZones(zones));
  }

  async clearSpinner(commentId: number): Promise<void> {
    if (this.dryRun) {
      console.log(
        `[dry-run] would clear the spinner on comment #${commentId} (${this.commentUrl(commentId)})`,
      );
      return;
    }
    const body = await this.getCommentBody(commentId);
    const stripped = stripSpinner(body);
    if (stripped === body) return;
    await this.updateCommentBody(commentId, stripped);
  }

  async getOpenPrForBranch(head: string): Promise<OpenPr | null> {
    const res = await this.api.pulls.list({
      owner: this.owner,
      repo: this.repoName,
      head: `${this.owner}:${head}`,
      state: "open",
      per_page: 1,
    });
    const pr = res.data[0];
    if (!pr) return null;
    return {
      number: pr.number,
      url: pr.html_url,
      body: pr.body ?? "",
      baseRef: pr.base.ref,
    };
  }

  // Any-state PR lookup for the salvage path: a merged/closed PR must be
  // visible so salvage never opens a duplicate. Precedence open > merged >
  // closed-unmerged, newest first within each class.
  async getPrForBranch(head: string): Promise<BranchPr | null> {
    const res = await this.api.pulls.list({
      owner: this.owner,
      repo: this.repoName,
      head: `${this.owner}:${head}`,
      state: "all",
      per_page: 20,
    });
    const toBranchPr = (pr: (typeof res.data)[number]): BranchPr => ({
      number: pr.number,
      url: pr.html_url,
      body: pr.body ?? "",
      baseRef: pr.base.ref,
      state: pr.state === "open" ? "open" : "closed",
      merged: pr.merged_at != null,
    });
    const open = res.data.find((pr) => pr.state === "open");
    if (open) return toBranchPr(open);
    const merged = res.data.find((pr) => pr.merged_at != null);
    if (merged) return toBranchPr(merged);
    const newest = res.data[0];
    return newest ? toBranchPr(newest) : null;
  }

  // Discovery for the issue-context "continue prior work" prompt: PRs that
  // reference this issue, read from the issue's timeline cross-reference events
  // (GitHub's own linkage - more accurate than a text search and free of
  // #10-matches-#100 false positives). A read; the caller treats it as
  // fail-soft. The timeline payload does not carry the PR head/base ref, so
  // those are left empty - the agent resolves the branch with `gh pr checkout`.
  // Scans only the first page (100 events, oldest-first): this is breadth on
  // top of getOpenPrForBranch, which already catches the conventional
  // fix/issue-N branch regardless of timeline length, so a long issue at worst
  // drops a non-conventional cross-reference, never the core continuation hit.
  async findPrsReferencingIssue(issueNumber: number): Promise<AssociatedPr[]> {
    const res = await this.api.issues.listEventsForTimeline({
      owner: this.owner,
      repo: this.repoName,
      issue_number: issueNumber,
      per_page: 100,
    });
    const events = res.data as unknown as TimelineCrossReference[];
    const byNumber = new Map<number, AssociatedPr>();
    for (const e of events) {
      if (e.event !== "cross-referenced") continue;
      const issue = e.source?.issue;
      if (!issue || !issue.pull_request || typeof issue.number !== "number") {
        continue;
      }
      byNumber.set(issue.number, {
        number: issue.number,
        url: issue.html_url ?? "",
        state: issue.state ?? "",
        headRef: "",
        baseRef: "",
        isDraft: issue.draft ?? false,
        title: issue.title ?? "",
      });
    }
    return [...byNumber.values()];
  }

  // Backfill path: the runner rewrites a PR body the agent left too thin. This
  // is a write on the PR resource (pulls.update), distinct from the issue-comment
  // writes above, and is gated by the same dry-run/redactor handling.
  async updatePullRequestBody(prNumber: number, body: string): Promise<void> {
    const safeBody = this.redactor ? this.redactor.redact(body) : body;
    if (this.dryRun) {
      console.log(
        `[dry-run] would update PR #${prNumber} body (${this.prUrl(prNumber)}):\n${safeBody}`,
      );
      return;
    }
    await this.api.pulls.update({
      owner: this.owner,
      repo: this.repoName,
      pull_number: prNumber,
      body: safeBody,
    });
  }

  // Runner-owned PR creation (the recovery safety net). Distinct from the
  // agent's own `gh pr create`: when a weak model edits files but never
  // branches/commits/pushes/opens a PR, the runner pushes the recovered work and
  // opens a DRAFT PR here so nothing is lost. Gated by the same dry-run/redactor
  // handling as every other mutation; reuses the OpenPr shape so callers can
  // hand the result straight to the PR-link path.
  async createDraftPr(input: CreateDraftPrInput): Promise<OpenPr> {
    const safeBody = this.redactor
      ? this.redactor.redact(input.body)
      : input.body;
    if (this.dryRun) {
      console.log(
        `[dry-run] would open a DRAFT PR ${input.head} -> ${input.base} titled "${input.title}":\n${safeBody}`,
      );
      return {
        number: 0,
        url: "(dry-run)",
        body: safeBody,
        baseRef: input.base,
      };
    }
    const res = await this.api.pulls.create({
      owner: this.owner,
      repo: this.repoName,
      head: input.head,
      base: input.base,
      title: input.title,
      body: safeBody,
      draft: true,
    });
    return {
      number: res.data.number,
      url: res.data.html_url,
      body: res.data.body ?? "",
      baseRef: res.data.base.ref,
    };
  }

  async getDefaultBranch(): Promise<string> {
    const res = await this.api.repos.get({
      owner: this.owner,
      repo: this.repoName,
    });
    return res.data.default_branch;
  }

  async getPullRequest(prNumber: number): Promise<PullRequestSummary> {
    const res = await this.api.pulls.get({
      owner: this.owner,
      repo: this.repoName,
      pull_number: prNumber,
    });
    return {
      title: res.data.title,
      body: res.data.body ?? "",
      headRef: res.data.head.ref,
      headRepoFullName: res.data.head.repo?.full_name ?? "",
      baseRef: res.data.base.ref,
    };
  }

  async listIssueComments(
    issueOrPrNumber: number,
  ): Promise<IssueCommentSummary[]> {
    const collected: IssueCommentSummary[] = [];
    const maxPages = 2;
    for (let page = 1; page <= maxPages; page++) {
      const res = await this.api.issues.listComments({
        owner: this.owner,
        repo: this.repoName,
        issue_number: issueOrPrNumber,
        per_page: 100,
        page,
      });
      for (const c of res.data) {
        collected.push({
          id: c.id,
          author: c.user?.login ?? "unknown",
          body: c.body ?? "",
          createdAt: c.created_at,
        });
      }
      if (res.data.length < 100) break;
    }
    return collected;
  }
}

export interface PullRequestSummary {
  title: string;
  body: string;
  headRef: string;
  headRepoFullName: string;
  baseRef: string;
}

export interface OpenPr {
  number: number;
  url: string;
  body: string;
  baseRef: string;
}

// OpenPr plus the state salvage needs to avoid duplicate PRs.
export interface BranchPr extends OpenPr {
  state: "open" | "closed";
  merged: boolean;
}

export interface CreateDraftPrInput {
  head: string;
  base: string;
  title: string;
  body: string;
}

// A pull request found to be associated with an issue (via the conventional
// fix/issue-N branch or a timeline cross-reference). Fed into the issue task
// prompt so the agent can continue prior work instead of starting fresh.
// headRef/baseRef are populated only for the conventional-branch hit; for
// timeline-derived PRs they are empty and the agent resolves them itself.
export interface AssociatedPr {
  number: number;
  url: string;
  state: string;
  headRef: string;
  baseRef: string;
  isDraft: boolean;
  title: string;
}

// Minimal shape of a GitHub issue-timeline "cross-referenced" event. The
// timeline API returns a wide union of event shapes, so findPrsReferencingIssue
// narrows through this. `pull_request` is present on the referencing item only
// when it is a PR (not a plain issue).
interface TimelineCrossReference {
  event?: string;
  source?: {
    issue?: {
      number?: number;
      html_url?: string;
      title?: string;
      state?: string;
      draft?: boolean;
      pull_request?: unknown;
    };
  };
}

export interface IssueCommentSummary {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

export interface GithubReader {
  readonly owner: string;
  readonly repoName: string;
  getPullRequest(prNumber: number): Promise<PullRequestSummary>;
  listIssueComments(issueOrPrNumber: number): Promise<IssueCommentSummary[]>;
  getOpenPrForBranch(head: string): Promise<OpenPr | null>;
  findPrsReferencingIssue(issueNumber: number): Promise<AssociatedPr[]>;
}

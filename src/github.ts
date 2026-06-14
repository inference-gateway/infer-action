import { Octokit } from "@octokit/rest";
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
// literal in action.yml — both render the same indicator before the runner starts.
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
}

export class GithubClient {
  private readonly octokit: Octokit;
  private readonly redactor: Redactor | undefined;
  private readonly dryRun: boolean;
  readonly owner: string;
  readonly repoName: string;

  constructor(opts: GithubClientOptions) {
    this.octokit = new Octokit({ auth: opts.token });
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
    const res = await this.octokit.issues.getComment({
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
    await this.octokit.issues.updateComment({
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
    await this.octokit.issues.createComment({
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
    const res = await this.octokit.pulls.list({
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
    await this.octokit.pulls.update({
      owner: this.owner,
      repo: this.repoName,
      pull_number: prNumber,
      body: safeBody,
    });
  }

  async getPullRequest(prNumber: number): Promise<PullRequestSummary> {
    const res = await this.octokit.pulls.get({
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
      const res = await this.octokit.issues.listComments({
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
}

import { Octokit } from "@octokit/rest";

export const PLAN_END = "<!-- infer:plan-end -->";
export const RESULT_START = "<!-- infer:result-start -->";

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
}

export class GithubClient {
  private readonly octokit: Octokit;
  readonly owner: string;
  readonly repoName: string;

  constructor(opts: GithubClientOptions) {
    this.octokit = new Octokit({ auth: opts.token });
    const [owner, name] = opts.repo.split("/");
    if (!owner || !name) {
      throw new Error(
        `Invalid repo string "${opts.repo}", expected "owner/name"`,
      );
    }
    this.owner = owner;
    this.repoName = name;
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
    await this.octokit.issues.updateComment({
      owner: this.owner,
      repo: this.repoName,
      comment_id: commentId,
      body,
    });
  }

  async createIssueComment(issueNumber: number, body: string): Promise<void> {
    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repoName,
      issue_number: issueNumber,
      body,
    });
  }

  async updateZone(
    commentId: number,
    zone: keyof Zones,
    newContent: string,
  ): Promise<void> {
    const body = await this.getCommentBody(commentId);
    const zones = splitZones(body);
    zones[zone] = newContent;
    await this.updateCommentBody(commentId, joinZones(zones));
  }

  async findOpenPrForBranch(head: string): Promise<string | null> {
    const res = await this.octokit.pulls.list({
      owner: this.owner,
      repo: this.repoName,
      head: `${this.owner}:${head}`,
      state: "open",
      per_page: 1,
    });
    return res.data[0]?.html_url ?? null;
  }
}

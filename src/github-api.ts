// Thin fetch-based GitHub REST client, replacing @octokit/rest (which was
// essentially the entire weight of the three dist bundles for the 10 plain
// endpoints below). The namespace shape (issues/pulls/repos + `{ data }`
// responses) deliberately mirrors Octokit's so GithubClient's method bodies
// stayed unchanged in the swap.
//
// Error semantics are load-bearing: fetch does not reject on HTTP errors, but
// every call site is built around thrown errors caught fail-soft, so request()
// throws on any !ok response. No retries — parity with the plugin-less Octokit
// core this replaces.

export interface GhResponse<T> {
  data: T;
}

export interface RawIssueComment {
  id: number;
  user?: { login?: string | null } | null;
  body?: string | null;
  created_at: string;
}

export interface RawReviewComment {
  id: number;
  user?: { login?: string | null } | null;
  body?: string | null;
  created_at: string;
  in_reply_to_id?: number | null;
}

export interface RawPr {
  number: number;
  html_url: string;
  body?: string | null;
  base: { ref: string };
  state: string;
  merged_at?: string | null;
}

export interface RawPrDetail extends RawPr {
  title: string;
  head: { ref: string; repo?: { full_name?: string | null } | null };
}

export interface GithubApiOptions {
  // Empty token ⇒ unauthenticated requests (dry-run reads, which fail-soft).
  token: string;
  // Defaults to GITHUB_API_URL (set on every Actions runner, including GHES),
  // falling back to the public API.
  baseUrl?: string;
  // Test seam: github-api.test.ts injects a capturing fake here.
  fetchImpl?: typeof fetch;
}

type Query = Record<string, string | number>;

export class GithubApi {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GithubApiOptions) {
    this.token = opts.token;
    this.baseUrl = (
      opts.baseUrl ||
      process.env["GITHUB_API_URL"] ||
      "https://api.github.com"
    ).replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  readonly issues = {
    getComment: (p: {
      owner: string;
      repo: string;
      comment_id: number;
    }): Promise<GhResponse<{ body?: string | null }>> =>
      this.request(
        "GET",
        `/repos/${p.owner}/${p.repo}/issues/comments/${p.comment_id}`,
      ),
    updateComment: (p: {
      owner: string;
      repo: string;
      comment_id: number;
      body: string;
    }): Promise<GhResponse<unknown>> =>
      this.request(
        "PATCH",
        `/repos/${p.owner}/${p.repo}/issues/comments/${p.comment_id}`,
        undefined,
        { body: p.body },
      ),
    createComment: (p: {
      owner: string;
      repo: string;
      issue_number: number;
      body: string;
    }): Promise<GhResponse<unknown>> =>
      this.request(
        "POST",
        `/repos/${p.owner}/${p.repo}/issues/${p.issue_number}/comments`,
        undefined,
        { body: p.body },
      ),
    listComments: (p: {
      owner: string;
      repo: string;
      issue_number: number;
      per_page: number;
      page: number;
    }): Promise<GhResponse<RawIssueComment[]>> =>
      this.request(
        "GET",
        `/repos/${p.owner}/${p.repo}/issues/${p.issue_number}/comments`,
        { per_page: p.per_page, page: p.page },
      ),
    listEventsForTimeline: (p: {
      owner: string;
      repo: string;
      issue_number: number;
      per_page: number;
    }): Promise<GhResponse<unknown[]>> =>
      this.request(
        "GET",
        `/repos/${p.owner}/${p.repo}/issues/${p.issue_number}/timeline`,
        { per_page: p.per_page },
      ),
  };

  readonly pulls = {
    list: (p: {
      owner: string;
      repo: string;
      head: string;
      state: string;
      per_page: number;
    }): Promise<GhResponse<RawPr[]>> =>
      this.request("GET", `/repos/${p.owner}/${p.repo}/pulls`, {
        head: p.head,
        state: p.state,
        per_page: p.per_page,
      }),
    get: (p: {
      owner: string;
      repo: string;
      pull_number: number;
    }): Promise<GhResponse<RawPrDetail>> =>
      this.request("GET", `/repos/${p.owner}/${p.repo}/pulls/${p.pull_number}`),
    create: (p: {
      owner: string;
      repo: string;
      head: string;
      base: string;
      title: string;
      body: string;
      draft: boolean;
    }): Promise<GhResponse<RawPrDetail>> =>
      this.request("POST", `/repos/${p.owner}/${p.repo}/pulls`, undefined, {
        head: p.head,
        base: p.base,
        title: p.title,
        body: p.body,
        draft: p.draft,
      }),
    listComments: (p: {
      owner: string;
      repo: string;
      pull_number: number;
      per_page: number;
      page: number;
    }): Promise<GhResponse<RawReviewComment[]>> =>
      this.request(
        "GET",
        `/repos/${p.owner}/${p.repo}/pulls/${p.pull_number}/comments`,
        { per_page: p.per_page, page: p.page },
      ),
    update: (p: {
      owner: string;
      repo: string;
      pull_number: number;
      body: string;
    }): Promise<GhResponse<unknown>> =>
      this.request(
        "PATCH",
        `/repos/${p.owner}/${p.repo}/pulls/${p.pull_number}`,
        undefined,
        { body: p.body },
      ),
    createReviewCommentReply: (p: {
      owner: string;
      repo: string;
      pull_number: number;
      body: string;
      in_reply_to: number;
    }): Promise<GhResponse<unknown>> =>
      this.request(
        "POST",
        `/repos/${p.owner}/${p.repo}/pulls/${p.pull_number}/comments`,
        undefined,
        { body: p.body, in_reply_to: p.in_reply_to },
      ),
    getComment: (p: {
      owner: string;
      repo: string;
      comment_id: number;
    }): Promise<GhResponse<{ body?: string | null }>> =>
      this.request(
        "GET",
        `/repos/${p.owner}/${p.repo}/pulls/comments/${p.comment_id}`,
      ),
    updateComment: (p: {
      owner: string;
      repo: string;
      comment_id: number;
      body: string;
    }): Promise<GhResponse<unknown>> =>
      this.request(
        "PATCH",
        `/repos/${p.owner}/${p.repo}/pulls/comments/${p.comment_id}`,
        undefined,
        { body: p.body },
      ),
  };

  readonly repos = {
    get: (p: {
      owner: string;
      repo: string;
    }): Promise<GhResponse<{ default_branch: string }>> =>
      this.request("GET", `/repos/${p.owner}/${p.repo}`),
  };

  private async request<T>(
    method: string,
    path: string,
    query?: Query,
    body?: unknown,
  ): Promise<GhResponse<T>> {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        params.set(key, String(value));
      }
      url += `?${params.toString()}`;
    }

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      // Deliberately NOT the newest version (2026-03-10): GHES instances
      // reject versions they don't ship (410), and current GHES supports only
      // 2022-11-28 (github.com supports it until 2028-03-10). The newer
      // version's breaking changes only remove fields this client never reads
      // (assignee, merge_commit_sha, has_downloads), so nothing is lost.
      "X-GitHub-Api-Version": "2022-11-28",
      // GitHub rejects UA-less requests; don't rely on the runtime's default.
      "User-Agent": "infer-action",
    };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await this.fetchImpl(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `GitHub API ${method} ${path} -> ${res.status} ${res.statusText}: ${text.slice(0, 300)}`,
      );
    }
    if (res.status === 204) {
      return { data: undefined as T };
    }
    return { data: (await res.json()) as T };
  }
}

// Structural surface for test doubles and DI (GithubClientOptions.api).
export type GithubApiLike = Pick<GithubApi, "issues" | "pulls" | "repos">;

import { describe, expect, it, mock } from "bun:test";
import { GithubApi } from "../src/github-api.js";

interface CapturedRequest {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
}

function makeApi(opts: { token?: string; status?: number; body?: unknown }): {
  api: GithubApi;
  captured: CapturedRequest[];
} {
  const captured: CapturedRequest[] = [];
  const status = opts.status ?? 200;
  const fetchImpl = mock(async (url: unknown, init: unknown) => {
    captured.push({
      url: String(url),
      init: init as CapturedRequest["init"],
    });
    return new Response(JSON.stringify(opts.body ?? {}), {
      status,
      statusText: status === 200 ? "OK" : "Error",
    });
  }) as unknown as typeof fetch;
  const api = new GithubApi({
    token: opts.token ?? "tok",
    baseUrl: "https://api.example.test",
    fetchImpl,
  });
  return { api, captured };
}

describe("GithubApi request shaping", () => {
  it("GETs the comment endpoint with auth and API-version headers", async () => {
    const { api, captured } = makeApi({ body: { body: "hi" } });

    const res = await api.issues.getComment({
      owner: "o",
      repo: "r",
      comment_id: 12,
    });

    expect(res.data).toEqual({ body: "hi" });
    expect(captured[0]!.url).toBe(
      "https://api.example.test/repos/o/r/issues/comments/12",
    );
    expect(captured[0]!.init.method).toBe("GET");
    expect(captured[0]!.init.headers).toMatchObject({
      Accept: "application/vnd.github+json",
      Authorization: "Bearer tok",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "infer-action",
    });
    expect(captured[0]!.init.body).toBeUndefined();
  });

  it("omits the Authorization header when the token is empty", async () => {
    const { api, captured } = makeApi({ token: "", body: [] });

    await api.pulls.list({
      owner: "o",
      repo: "r",
      head: "o:b",
      state: "open",
      per_page: 1,
    });

    expect(captured[0]!.init.headers["Authorization"]).toBeUndefined();
  });

  it("encodes query params, including the owner-qualified head", async () => {
    const { api, captured } = makeApi({ body: [] });

    await api.pulls.list({
      owner: "o",
      repo: "r",
      head: "o:fix/issue-42",
      state: "all",
      per_page: 20,
    });

    const url = new URL(captured[0]!.url);
    expect(url.pathname).toBe("/repos/o/r/pulls");
    expect(url.searchParams.get("head")).toBe("o:fix/issue-42");
    expect(url.searchParams.get("state")).toBe("all");
    expect(url.searchParams.get("per_page")).toBe("20");
  });

  it("POSTs a JSON body for pulls.create with draft flag", async () => {
    const { api, captured } = makeApi({
      body: {
        number: 7,
        html_url: "u",
        base: { ref: "main" },
        state: "open",
        title: "t",
        head: { ref: "b" },
      },
    });

    await api.pulls.create({
      owner: "o",
      repo: "r",
      head: "fix/issue-1",
      base: "main",
      title: "fix: it",
      body: "the body",
      draft: true,
    });

    expect(captured[0]!.init.method).toBe("POST");
    expect(captured[0]!.init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(captured[0]!.init.body))).toEqual({
      head: "fix/issue-1",
      base: "main",
      title: "fix: it",
      body: "the body",
      draft: true,
    });
  });

  it("PATCHes comment updates", async () => {
    const { api, captured } = makeApi({});

    await api.issues.updateComment({
      owner: "o",
      repo: "r",
      comment_id: 3,
      body: "new",
    });

    expect(captured[0]!.init.method).toBe("PATCH");
    expect(captured[0]!.url).toBe(
      "https://api.example.test/repos/o/r/issues/comments/3",
    );
    expect(JSON.parse(String(captured[0]!.init.body))).toEqual({ body: "new" });
  });

  it("throws on a non-ok response with status and body in the message", async () => {
    const { api } = makeApi({ status: 404, body: { message: "Not Found" } });

    await expect(api.repos.get({ owner: "o", repo: "gone" })).rejects.toThrow(
      /GitHub API GET \/repos\/o\/gone -> 404 .*Not Found/,
    );
  });

  it("defaults the base URL to GITHUB_API_URL when set", async () => {
    const saved = process.env["GITHUB_API_URL"];
    process.env["GITHUB_API_URL"] = "https://ghes.example.test/api/v3/";
    try {
      const captured: string[] = [];
      const fetchImpl = mock(async (url: unknown) => {
        captured.push(String(url));
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch;
      const api = new GithubApi({ token: "t", fetchImpl });

      await api.repos.get({ owner: "o", repo: "r" });

      expect(captured[0]).toBe("https://ghes.example.test/api/v3/repos/o/r");
    } finally {
      if (saved === undefined) delete process.env["GITHUB_API_URL"];
      else process.env["GITHUB_API_URL"] = saved;
    }
  });
});

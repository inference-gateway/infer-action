import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildFooter,
  collectArtifacts,
  formatBytes,
  type FooterArgs,
} from "../src/report.js";
import { GithubClient } from "../src/github.js";
import type { GithubApiLike } from "../src/github-api.js";

function baseArgs(overrides: Partial<FooterArgs> = {}): FooterArgs {
  return {
    exitCode: "0",
    modelUsed: "mock/mock-v1",
    workflowUrl: "",
    durationMs: 0,
    actor: "tester",
    stoppedEarly: false,
    prUrl: "",
    agentResponse: "",
    failures: [],
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 0,
      toolCalls: 0,
    },
    traces: "",
    stats: "",
    ...overrides,
  };
}

function stageDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "infer-artifacts-test-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

const okUpload = (runId: string, name: string): Promise<string | null> =>
  Promise.resolve(`https://raw.test/infer-artifacts/${runId}/${name}`);
const failUpload = (): Promise<string | null> => Promise.resolve(null);

describe("collectArtifacts", () => {
  it("embeds images and lists other files", async () => {
    const dir = stageDir({ "shot.png": "png-bytes", "notes.txt": "hello" });
    const section = await collectArtifacts(
      dir,
      "https://dl.test/1",
      "42",
      okUpload,
    );
    expect(section).toBeDefined();
    expect(section?.images).toEqual([
      { name: "shot.png", url: "https://raw.test/infer-artifacts/42/shot.png" },
    ]);
    expect(section?.files).toEqual([{ name: "notes.txt", size: 5 }]);
    expect(section?.downloadUrl).toBe("https://dl.test/1");
  });

  it("falls back to the file list when the image upload fails", async () => {
    const dir = stageDir({ "shot.png": "png-bytes" });
    const section = await collectArtifacts(dir, "", "42", failUpload);
    expect(section?.images).toEqual([]);
    expect(section?.files).toEqual([{ name: "shot.png", size: 9 }]);
  });

  it("returns undefined for an empty or missing dir", async () => {
    expect(
      await collectArtifacts(stageDir({}), "", "42", okUpload),
    ).toBeUndefined();
    expect(
      await collectArtifacts("/nonexistent/nope", "", "42", okUpload),
    ).toBeUndefined();
    expect(await collectArtifacts("", "", "42", okUpload)).toBeUndefined();
  });

  it("skips subdirectories", async () => {
    const dir = stageDir({ "a.txt": "x" });
    mkdirSync(join(dir, "sub"));
    const section = await collectArtifacts(dir, "", "42", okUpload);
    expect(section?.files).toEqual([{ name: "a.txt", size: 1 }]);
  });
});

describe("buildFooter artifacts section", () => {
  it("renders embedded images, file list, and download link", () => {
    const footer = buildFooter(
      baseArgs({
        artifacts: {
          images: [{ name: "shot.png", url: "https://raw.test/shot.png" }],
          files: [{ name: "notes.txt", size: 2048 }],
          downloadUrl: "https://dl.test/artifact",
        },
      }),
    );
    expect(footer).toContain("### Artifacts");
    expect(footer).toContain("![shot.png](https://raw.test/shot.png)");
    expect(footer).toContain("- `notes.txt` (2.0 KB)");
    expect(footer).toContain(
      "[Download all artifacts](https://dl.test/artifact)",
    );
  });

  it("omits the section entirely when there are no artifacts", () => {
    expect(buildFooter(baseArgs())).not.toContain("### Artifacts");
  });
});

describe("formatBytes", () => {
  it("formats B, KB, and MB", () => {
    expect(formatBytes(12)).toBe("12 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("GithubClient.uploadArtifactImage", () => {
  const bytes = new TextEncoder().encode("img");

  function fakeApi(opts: { branchExists: boolean }): {
    api: GithubApiLike;
    calls: string[];
  } {
    const calls: string[] = [];
    const api = {
      git: {
        getRef: (p: { ref: string }) => {
          calls.push(`getRef:${p.ref}`);
          if (p.ref === "heads/infer-artifacts" && !opts.branchExists) {
            return Promise.reject(new Error("404"));
          }
          return Promise.resolve({ data: { object: { sha: "abc123" } } });
        },
        createRef: (p: { ref: string; sha: string }) => {
          calls.push(`createRef:${p.ref}@${p.sha}`);
          return Promise.resolve({ data: {} });
        },
        createCommit: (p: { message: string; tree: string }) => {
          calls.push(`createCommit:${p.tree}`);
          return Promise.resolve({ data: { sha: "commit123" } });
        },
      },
      repos: {
        get: () => Promise.resolve({ data: { default_branch: "main" } }),
        createOrUpdateFileContents: (p: { path: string; branch: string }) => {
          calls.push(`put:${p.branch}/${p.path}`);
          return Promise.resolve({
            data: { content: { download_url: "https://raw.test/dl.png" } },
          });
        },
      },
    } as unknown as GithubApiLike;
    return { api, calls };
  }

  it("uploads to the existing artifacts branch and returns the download URL", async () => {
    const { api, calls } = fakeApi({ branchExists: true });
    const client = new GithubClient({ token: "t", repo: "o/r", api });
    const url = await client.uploadArtifactImage("42", "shot.png", bytes);
    expect(url).toBe("https://raw.test/dl.png");
    expect(calls).toEqual([
      "getRef:heads/infer-artifacts",
      "put:infer-artifacts/42/shot.png",
    ]);
  });

  it("creates the branch as an orphan when missing", async () => {
    const { api, calls } = fakeApi({ branchExists: false });
    const client = new GithubClient({ token: "t", repo: "o/r", api });
    const url = await client.uploadArtifactImage("42", "shot.png", bytes);
    expect(url).toBe("https://raw.test/dl.png");
    expect(calls).toContain(
      "createCommit:4b825dc642cb6eb9a060e54bf8d69288fbee4904",
    );
    expect(calls).toContain("createRef:refs/heads/infer-artifacts@commit123");
  });

  it("returns null when the upload fails", async () => {
    const api = {
      git: {
        getRef: () => Promise.reject(new Error("403 forbidden")),
      },
      repos: {
        get: () => Promise.reject(new Error("403 forbidden")),
      },
    } as unknown as GithubApiLike;
    const client = new GithubClient({ token: "t", repo: "o/r", api });
    expect(await client.uploadArtifactImage("42", "x.png", bytes)).toBeNull();
  });

  it("dry-run returns a URL without touching the API", async () => {
    const client = new GithubClient({
      token: "",
      repo: "o/r",
      dryRun: true,
      api: {} as GithubApiLike,
    });
    const url = await client.uploadArtifactImage("42", "shot.png", bytes);
    expect(url).toBe(
      "https://raw.githubusercontent.com/o/r/infer-artifacts/42/shot.png",
    );
  });
});

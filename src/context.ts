import type { AssociatedPr, GithubReader } from "./github.js";

export type TaskContext = IssueContext | PullRequestContext | DirectContext;

export interface IssueContext {
  kind: "issue";
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  triggeringComment?: TriggeringComment;
  associatedPrs?: AssociatedPr[];
  associatedBranches?: string[];
  threadComments?: PrComment[];
}

// A manually dispatched run (workflow_dispatch): the task is free text, with no
// issue or PR thread to read from or reply to. See loadDirectContext.
export interface DirectContext {
  kind: "direct";
  prompt: string;
}

export interface PullRequestContext {
  kind: "pull_request";
  prNumber: number;
  prTitle: string;
  prBody: string;
  headRef: string;
  baseRef: string;
  headRepoFullName: string;
  isFork: boolean;
  triggeringCommentId: number;
  comments: PrComment[];
  reviewComment?: ReviewCommentFocus;
}

export interface ReviewCommentFocus {
  path: string;
  diffHunk: string;
  line?: number;
  startLine?: number;
}

export interface TriggeringComment {
  id: number;
  body: string;
  author: string;
}

export interface PrComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  isTrigger: boolean;
}

type Env = Record<string, string | undefined>;

export async function loadContext(
  env: Env,
  github: GithubReader,
): Promise<TaskContext> {
  const kind = env["INFER_CONTEXT_KIND"];
  if (!kind) {
    throw new Error("Missing required env var INFER_CONTEXT_KIND");
  }

  if (kind === "issue") {
    return loadIssueContext(env, github);
  }
  if (kind === "pull_request") {
    return loadPullRequestContext(env, github);
  }
  if (kind === "direct") {
    return loadDirectContext(env);
  }
  throw new Error(
    `Unknown INFER_CONTEXT_KIND "${kind}" (expected "issue", "pull_request", or "direct")`,
  );
}

// Dry-run only: build a minimal TaskContext purely from env when a network read
// in loadContext fails (the pull_request kind is the only one that reads). Lets
// a tokenless/offline dry-run still proceed instead of crashing. Shared by the
// runner and the recover entrypoint.
export function loadFallbackContext(env: Env): TaskContext {
  const kind = env["INFER_CONTEXT_KIND"];
  if (kind === "direct") {
    return {
      kind: "direct",
      prompt:
        (env["INFER_DIRECT_PROMPT"] ?? "").trim() || "(dry-run: no prompt)",
    };
  }
  if (kind === "pull_request") {
    const reviewComment = parseReviewComment(env);
    const trigger = reviewComment ? parseTriggeringComment(env) : undefined;
    return {
      kind: "pull_request",
      prNumber: Number.parseInt(env["INFER_ISSUE_NUMBER"] ?? "0", 10) || 0,
      prTitle: "(dry-run: PR title unavailable)",
      prBody: "",
      headRef: "(unknown)",
      baseRef: "main",
      headRepoFullName: "",
      isFork: false,
      triggeringCommentId: trigger?.id ?? 0,
      comments: trigger
        ? [
            {
              id: trigger.id,
              author: trigger.author,
              body: trigger.body,
              createdAt: "",
              isTrigger: true,
            },
          ]
        : [],
      ...(reviewComment ? { reviewComment } : {}),
    };
  }
  return {
    kind: "issue",
    issueNumber: Number.parseInt(env["INFER_ISSUE_NUMBER"] ?? "0", 10) || 0,
    issueTitle: env["INFER_ISSUE_TITLE"] ?? "",
    issueBody: env["INFER_ISSUE_BODY"] ?? "",
  };
}

function loadDirectContext(env: Env): DirectContext {
  const prompt = (env["INFER_DIRECT_PROMPT"] ?? "").trim();
  if (!prompt) {
    throw new Error("Missing or empty INFER_DIRECT_PROMPT for direct context");
  }
  return { kind: "direct", prompt };
}

async function loadIssueContext(
  env: Env,
  github: GithubReader,
): Promise<IssueContext> {
  const issueNumber = Number.parseInt(env["INFER_ISSUE_NUMBER"] ?? "", 10);
  if (!Number.isFinite(issueNumber)) {
    throw new Error("Missing or invalid INFER_ISSUE_NUMBER");
  }
  const issueTitle = env["INFER_ISSUE_TITLE"] ?? "";
  const issueBody = env["INFER_ISSUE_BODY"] ?? "";
  const triggeringComment = parseTriggeringComment(env);
  const [{ associatedPrs, associatedBranches }, threadComments] =
    await Promise.all([
      gatherExistingWork(github, issueNumber),
      fetchIssueThread(github, issueNumber, triggeringComment?.id ?? 0),
    ]);

  return {
    kind: "issue",
    issueNumber,
    issueTitle,
    issueBody,
    ...(triggeringComment ? { triggeringComment } : {}),
    ...(associatedPrs.length ? { associatedPrs } : {}),
    ...(associatedBranches.length ? { associatedBranches } : {}),
    ...(threadComments.length ? { threadComments } : {}),
  };
}

// The issue's discussion thread, for the "recent comments" prompt section.
// Fail-soft like gatherExistingWork: nice-to-have context, never fails a run.
async function fetchIssueThread(
  github: GithubReader,
  issueNumber: number,
  triggerId: number,
): Promise<PrComment[]> {
  try {
    const raw = await github.listIssueComments(issueNumber);
    return raw.map((c) => ({
      id: c.id,
      author: c.author,
      body: c.body,
      createdAt: c.createdAt,
      isTrigger: triggerId > 0 && c.id === triggerId,
    }));
  } catch (e) {
    console.warn(
      `[context] failed to list comments for issue #${issueNumber}; proceeding without the thread:`,
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}

// Reads the branches/PRs already associated with an issue so the task prompt can
// ask the agent to continue prior work instead of starting fresh. Fail-soft: any
// error logs and yields empty arrays, so the run proceeds exactly as before.
// Two sources, deduped by PR number: the conventional fix/issue-N branch (which
// the runner's own recovery/happy paths use) and the issue's timeline
// cross-references. The branch hit contributes the known head/base ref; the
// timeline hit contributes richer state/draft/title - merged when a PR is both.
async function gatherExistingWork(
  github: GithubReader,
  issueNumber: number,
): Promise<{ associatedPrs: AssociatedPr[]; associatedBranches: string[] }> {
  const conventionalBranch = `fix/issue-${issueNumber}`;
  try {
    const [byBranch, byRef] = await Promise.all([
      github.getOpenPrForBranch(conventionalBranch),
      github.findPrsReferencingIssue(issueNumber),
    ]);
    const byNumber = new Map<number, AssociatedPr>();
    for (const pr of byRef) byNumber.set(pr.number, pr);
    if (byBranch) {
      const existing = byNumber.get(byBranch.number);
      byNumber.set(byBranch.number, {
        number: byBranch.number,
        url: existing?.url || byBranch.url,
        state: existing?.state || "open",
        headRef: conventionalBranch,
        baseRef: byBranch.baseRef,
        isDraft: existing?.isDraft ?? false,
        title: existing?.title ?? "",
      });
    }
    const associatedPrs = [...byNumber.values()];
    const associatedBranches = byBranch ? [conventionalBranch] : [];
    return { associatedPrs, associatedBranches };
  } catch (e) {
    console.warn(
      `[context] failed to gather existing work for issue #${issueNumber}; proceeding without it:`,
      e instanceof Error ? e.message : e,
    );
    return { associatedPrs: [], associatedBranches: [] };
  }
}

async function loadPullRequestContext(
  env: Env,
  github: GithubReader,
): Promise<PullRequestContext> {
  const prNumber = Number.parseInt(env["INFER_ISSUE_NUMBER"] ?? "", 10);
  if (!Number.isFinite(prNumber)) {
    throw new Error("Missing or invalid INFER_ISSUE_NUMBER for PR context");
  }

  const triggeringCommentId = Number.parseInt(
    env["INFER_TRIGGERING_COMMENT_ID"] ?? "",
    10,
  );
  const triggerId = Number.isFinite(triggeringCommentId)
    ? triggeringCommentId
    : 0;

  const reviewComment = parseReviewComment(env);
  const [pr, comments] = await Promise.all([
    github.getPullRequest(prNumber),
    reviewComment
      ? loadReviewThreadComments(env, github, prNumber, triggerId)
      : github.listIssueComments(prNumber).then((raw) =>
          raw.map((c): PrComment => ({
            id: c.id,
            author: c.author,
            body: c.body,
            createdAt: c.createdAt,
            isTrigger: triggerId > 0 && c.id === triggerId,
          })),
        ),
  ]);

  const selfFullName = `${github.owner}/${github.repoName}`;
  const isFork =
    pr.headRepoFullName !== "" && pr.headRepoFullName !== selfFullName;

  return {
    kind: "pull_request",
    prNumber,
    prTitle: pr.title,
    prBody: pr.body,
    headRef: pr.headRef,
    baseRef: pr.baseRef,
    headRepoFullName: pr.headRepoFullName,
    isFork,
    triggeringCommentId: triggerId,
    comments,
    ...(reviewComment ? { reviewComment } : {}),
  };
}

// The focused code section of an inline review-comment trigger, from the env
// vars the run-agent step maps off github.event.comment. Absence of the path
// is what distinguishes a conversation-comment run from a review-comment run.
function parseReviewComment(env: Env): ReviewCommentFocus | undefined {
  const path = (env["INFER_REVIEW_COMMENT_PATH"] ?? "").trim();
  if (!path) return undefined;
  const line = Number.parseInt(env["INFER_REVIEW_COMMENT_LINE"] ?? "", 10);
  const startLine = Number.parseInt(
    env["INFER_REVIEW_COMMENT_START_LINE"] ?? "",
    10,
  );
  return {
    path,
    diffHunk: env["INFER_REVIEW_COMMENT_DIFF_HUNK"] ?? "",
    ...(Number.isFinite(line) ? { line } : {}),
    ...(Number.isFinite(startLine) ? { startLine } : {}),
  };
}

// The comments list for a review-comment trigger: when the trigger replied to
// an earlier review comment, fetch that thread so the parent suggestion is
// visible; otherwise just the trigger itself, synthesized from env (zero extra
// reads). Never the PR conversation.
async function loadReviewThreadComments(
  env: Env,
  github: GithubReader,
  prNumber: number,
  triggerId: number,
): Promise<PrComment[]> {
  const rootId = Number.parseInt(
    env["INFER_REVIEW_COMMENT_IN_REPLY_TO"] ?? "",
    10,
  );
  const comments: PrComment[] = [];
  if (Number.isFinite(rootId) && rootId > 0) {
    const all = await github.listReviewComments(prNumber);
    for (const c of all) {
      if (c.id === rootId || c.inReplyToId === rootId) {
        comments.push({
          id: c.id,
          author: c.author,
          body: c.body,
          createdAt: c.createdAt,
          isTrigger: triggerId > 0 && c.id === triggerId,
        });
      }
    }
  }
  if (!comments.some((c) => c.isTrigger)) {
    const trigger = parseTriggeringComment(env);
    if (trigger) {
      comments.push({
        id: trigger.id,
        author: trigger.author,
        body: trigger.body,
        createdAt: "",
        isTrigger: true,
      });
    }
  }
  return comments;
}

function parseTriggeringComment(env: Env): TriggeringComment | undefined {
  const idRaw = env["INFER_TRIGGERING_COMMENT_ID"] ?? "";
  const body = env["INFER_TRIGGERING_COMMENT_BODY"] ?? "";
  const author = env["INFER_TRIGGERING_COMMENT_AUTHOR"] ?? "";
  const id = Number.parseInt(idRaw, 10);
  if (!Number.isFinite(id) || id <= 0) return undefined;
  if (!body.trim()) return undefined;
  return { id, body, author };
}

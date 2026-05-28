# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This repo is a **GitHub composite Action** (not a library, not a binary). The entire shipped artifact is `action.yml`. There is no compile step and no test runner — the "code" is the sequence of `shell: bash` steps inside `action.yml` plus the system prompt that gets embedded as the agent's instructions.

Consumers reference it as `inference-gateway/infer-action@<ref>` from their workflows. When a GitHub issue or comment containing the trigger phrase (`@infer` by default) fires, the action installs the `infer` CLI, builds a system prompt, and runs `infer agent` against the issue.

## Common commands

All local workflows go through `task` (Taskfile.yml) and `act` (runs GitHub Actions locally in Docker):

- `task setup` — copies `.env.example` → `.env`; verifies `act` is installed
- `task lint` — `markdownlint . --ignore '{CHANGELOG,AGENTS,CLAUDE}.md' --fix`
- `task test:issue` — runs the `infer.yml` workflow against `.github/workflows/events/issue-opened.json` via `act`
- `task test:comment` — same, against `issue-comment.json`
- `task test:dry-run` — `act --list` to show jobs without executing
- `task test:all` — runs both issue and comment scenarios
- `task clean` — removes `/tmp/agent-output.txt`

The test tasks require a populated `.env` (preconditions enforce this via `task check-env`).

Releases run via the manually-dispatched `Release` workflow (`.github/workflows/release.yml`), which invokes `semantic-release`. Versions are derived from conventional commit messages per `.releaserc.yaml`.

## Architecture: what `action.yml` actually does

The composite action is one linear pipeline. Understanding it requires reading the whole `action.yml`, but the shape is:

1. **`check-trigger`** — scans `github.event.issue.{title,body}` or `github.event.comment.body` for the trigger phrase; skips if a bot authored the comment (recursion guard); extracts an optional `/model provider/name` override into `model_override`. Sets `triggered=true/false` — every later step is gated on this.
2. **Eyes reaction** + **cooking comment** — posts an "I'm cooking..." comment and captures its ID into `cooking_comment_id`. **This ID is threaded into the system prompt** so the agent updates that single comment instead of spamming new ones. Before posting, it deletes any prior "I'm cooking" comments on the same issue.
3. **Install + init Infer CLI** — `curl | bash` from the `inference-gateway/cli` repo at the pinned `version` input.
4. **Configure Git** as `github-actions[bot]`.
5. **`run-agent`** — the core step. Assembles `INFER_AGENT_SYSTEM_PROMPT` (a here-doc that hard-codes the plan/PR workflow and interpolates `${REPO}`, `${ISSUE_NUMBER}`, `${COOKING_COMMENT_ID}`), exports provider API keys as env vars, sets `INFER_TOOLS_BASH_WHITELIST_{COMMANDS,PATTERNS}` (prepending `gh,git` and `^gh .*,^git .*` unless `enable-git-operations: false`), then runs `infer agent -m "$INFER_AGENT_MODEL" "$TASK"`. Output is teed to `/tmp/agent-output.txt`; failed tool calls are extracted with `jq` to `/tmp/failed-tool-calls.txt`, handling **both** shapes the stream emits — envelope failures (`{"role":"tool","content":"Tool execution failed: …"}`, which happen pre-dispatch for whitelist/param-validation errors) and dispatched-but-failed results (`{"role":"tool","content":"Result of tool call: {\"success\":false,…}"}`). The count is exposed as the `failed-count` step output.
6. **Post results** (runs on `always()`) — builds a structured markdown footer (status icon, model, exit code, workflow link, failed-tool-calls `<details>` if any, agent-output tail truncated to 40,000 chars) and **edits the cooking comment in place via PATCH** (`GET` existing body → `PATCH` with `<body>\n\n<footer>`). Falls back to `POST` only if `cooking_comment_id` is empty or the PATCH fails. The same footer is appended to `$GITHUB_STEP_SUMMARY` so the result is visible in the Actions tab. **One comment per workflow run** is the invariant this enforces.
7. **Cleanup** — removes the temp files.

Key cross-cutting concepts to keep coherent when editing:

- **The system prompt is part of the public API of this action.** It encodes the plan/progress/PR workflow consumers rely on. `custom-instructions` is *appended* to it, never replacing it.
- **`enable-git-operations: false` flips the action to comment-only mode** by withholding `git`/`gh` from the bash whitelist. The agent then physically cannot create branches or PRs.
- **Comment-ID threading** — `cooking_comment_id` is the join key between the early "I'm cooking" POST, the agent's in-run `Github(update_comment, …)` calls (instructed via the system prompt's `## REQUIRED: First action — publish your plan` section), and the post-results PATCH. Changing how/when that comment is created requires updating both the system prompt that references it and the post-results step that PATCHes it.
- **Branch-checking logic in the prompt**: the agent is instructed to detect whether it is already on a feature branch (skip new branch + PR) vs. on `main` (create `fix/issue-${N}` and open a PR). Workflows that pre-checkout a non-main branch get different behavior than fresh-checkout workflows — preserve this when editing the prompt.
- **Trigger-phrase matching is a substring check, not a regex** (`[[ "$ISSUE_BODY" == *"$TRIGGER_PHRASE"* ]]`). The `/model` override, by contrast, is parsed with a bash regex (`/model[[:space:]]+([a-zA-Z0-9/_.:-]+)`).

## Conventions

- **Commits must follow Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:` — see `.releaserc.yaml` for the release-impact mapping). `feat` → minor, `fix`/`docs`/`chore` → patch, breaking → major.
- **The pinned CLI version** lives in `action.yml` at `inputs.version.default` (currently `v0.68.3`). Bump it via a `chore(deps)` commit.
- **Don't add new top-level files lightly** — this is a single-purpose action. New behavior almost always belongs inside `action.yml` (a new input + a step) rather than a new script or directory.
- **`.infer/` is local agent state** (config, conversations, logs from running `infer` locally) and is gitignored — not part of the shipped action.

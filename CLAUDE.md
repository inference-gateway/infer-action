# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A **composite GitHub Action** (no build step, no runtime code in this repo) that runs the [Infer CLI](https://github.com/inference-gateway/cli) agent against GitHub issues and comments. Everything lives in `action.yml` — bash steps glued together by GitHub Actions. There is no Node/TS/Go source to compile.

The action is consumed by other repos via `uses: inference-gateway/infer-action@main` and is also dogfooded by `.github/workflows/infer.yml` in this repo.

## Common commands

Development uses [Flox](https://flox.dev) for environment management and [Task](https://taskfile.dev) as the runner.

```bash
flox activate              # enter dev shell (provides act, jq, curl, node, claude-code)
task                       # list tasks
task setup                 # copy .env.example → .env and verify `act` is installed
task lint                  # markdownlint --fix (ignores CHANGELOG.md)
task test:issue            # run action locally against events/issue-opened.json via act
task test:comment          # run action locally against events/issue-comment.json via act
task test:dry-run          # list jobs without executing
task clean                 # remove /tmp/agent-output.txt
```

Local testing requires `.env` populated with provider API keys (see `.env.example`) and Docker running for `act`. The `act` invocations pin the runner image to `catthehacker/ubuntu:act-24.04`.

## Architecture

`action.yml` is the entire product. Its steps run in order and are all gated on `steps.check-trigger.outputs.triggered == 'true'`:

1. **check-trigger** — parses `github.event` for the configured `trigger-phrase` (default `@infer`). Also extracts an optional `/model provider/name` override from the issue/comment body via a bash regex. Skips bot-authored comments to prevent recursion loops.
2. **Add eyes reaction** — only on `issue_comment` events.
3. **cooking-message** — deletes any prior "I'm cooking" comments on the issue, then posts a fresh one. The resulting `cooking_comment_id` is passed into the agent's system prompt so the agent updates that single comment instead of spamming new ones.
4. **install-cli** — curls the Infer CLI installer (version from `inputs.version`, default `v0.68.3`).
5. **init-cli** — `infer init --overwrite`.
6. **Configure Git** — sets `github-actions[bot]` as the commit identity.
7. **run-agent** — the load-bearing step. Builds `INFER_AGENT_SYSTEM_PROMPT` as a heredoc containing the GitHub workflow instructions (plan → update cooking comment → make changes → branch/PR logic), appends `inputs.custom-instructions` if provided, then invokes `infer agent -m "$MODEL" "$TASK"`. Output is teed to `/tmp/agent-output.txt`; failed tool calls are extracted with `jq`.
8. **Post results** — runs with `if: always()`; posts a final comment with status, model, exit code, and collapsed agent output.
9. **Cleanup** — removes the `/tmp` files.

### Key cross-cutting concerns

- **Bash whitelist**: The Infer CLI restricts shell commands via `INFER_TOOLS_BASH_WHITELIST_COMMANDS` and `INFER_TOOLS_BASH_WHITELIST_PATTERNS`. When `enable-git-operations: true` (default), `gh,git` and `^gh .*,^git .*` are prepended to whatever the user passes. Setting it to `false` strips git/gh entirely → comment-only mode. Anything the agent needs to run (npm, pytest, etc.) must be added through `bash-whitelist-commands` / `bash-whitelist-patterns`.
- **Model override flow**: `check-trigger` outputs `model_override`; `run-agent` uses `steps.check-trigger.outputs.model_override || inputs.model`. The same fallback is repeated in the "Post results" step — keep them in sync if changing.
- **Branch logic in system prompt**: The embedded instructions tell the agent to check `git branch --show-current` and only create `fix/issue-{N}` + a PR when starting from `main`/`master`. Otherwise it commits to the current branch. This logic lives in the heredoc inside `action.yml`, not in any external file.
- **Heredoc quoting**: Issue title/body are interpolated via `cat <<'EOF'` (single-quoted delimiter) to prevent the issue content from being interpreted as shell. Preserve this when editing — unquoted heredocs are a command-injection vector.

## Conventions

- **Conventional Commits are required.** `.releaserc.yaml` drives semantic-release on `main`: `feat`→minor, `fix`/`docs`/`chore`→patch, `breaking:`→major. The release workflow (`.github/workflows/release.yml`) is `workflow_dispatch` only.
- **Action input names**: kebab-case (`github-token`, `max-turns`). Bash variables: `snake_case` or `UPPER_SNAKE`.
- **Markdown**: linted by `markdownlint` per `.markdownlint.json`; `CHANGELOG.md` is excluded.

## Important files

- `action.yml` — the whole action; edits here are what ship.
- `.github/workflows/infer.yml` — this repo's own use of the action (dogfooding). Uses a GitHub App token, not `GITHUB_TOKEN`, so the agent's PRs trigger downstream workflows.
- `.github/workflows/events/*.json` — fixture payloads consumed by `task test:issue` / `task test:comment`.
- `.releaserc.yaml` — semantic-release config; releases are tagged `v${version}`.
- `AGENTS.md` — longer-form contributor guide; some details (Flox tool versions, etc.) may drift, prefer `.flox/env/manifest.toml` and `action.yml` as ground truth.

# Examples

Copy-paste workflow files that demonstrate the features of
[`inference-gateway/infer-action`](../README.md). Each file is a complete,
self-contained GitHub Actions workflow - drop one into your repository's
`.github/workflows/` directory and adjust the `model`, provider key, and
secrets to taste.

> These files live under `examples/` rather than `.github/workflows/`, so GitHub
> does **not** run them from this repository - they are documentation only.

## Index

| Example                                                | Demonstrates                                                                                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`issue-agent.yml`](issue-agent.yml)                   | The default flow: `@infer` on an issue/comment → branch + PR                                                                                               |
| [`comment-only-advisor.yml`](comment-only-advisor.yml) | Advisory / comment-only mode (`enable-git-operations: false`) - no commits or PRs                                                                          |
| [`with-skills.yml`](with-skills.yml)                   | Installing Infer skills and appending `custom-instructions`                                                                                                |
| [`with-agents.yml`](with-agents.yml)                   | Spinning up A2A agents as local Docker containers (the `agents` input)                                                                                     |
| [`go-project.yml`](go-project.yml)                     | A Go project: `languages: go` plus an allow-list derived from the repo's Taskfile                                                                          |
| [`rust-project.yml`](rust-project.yml)                 | A Rust project: `languages: rust`, `apt:` native deps, and a frontend pre-build step                                                                       |
| [`typescript-project.yml`](typescript-project.yml)     | A TypeScript project: `languages: typescript` plus a package.json-derived allow-list                                                                       |
| [`with-memory.yml`](with-memory.yml)                   | Persistent cross-run agent memory in a git branch of the workflow repo (the `memory-*` inputs)                                                             |
| [`with-plugins.yml`](with-plugins.yml)                 | Pre-installing infer-action plugins (the `plugins` input)                                                                                                  |
| [`with-inline-review.yml`](with-inline-review.yml)     | Inline PR review comments (`review-inline: true`) - ask as a PR conversation comment or submitted review (e.g. `@infer review this PR` / `@infer /review`) |
| [`with-reminders.yml`](with-reminders.yml)             | Custom CLI reminders (`reminders-config`) - your own plus replacing an action built-in                                                                     |
| [`with-task-templates.yml`](with-task-templates.yml)   | Task template overrides (`task-issue` / `task-pr`) built from the bundled templates                                                                        |
| [`with-time-budget.yml`](with-time-budget.yml)         | `time-budget-minutes` + job `timeout-minutes`, and reading the action `outputs` (`id:` + follow-up step)                                                   |

## Testing locally with `act`

The workflows above reference the **published** action, so they're copy-paste ready
but can't be run against your local checkout. For that, the
[`local/`](local) directory holds four thin workflows that run the
**working-tree** action (`uses: ./`) with [`dry-run: true`](../README.md#dry-run--local-testing),
wired to [`act`](https://github.com/nektos/act) via `task`:

| Command             | Workflow                                               | Event                         |
| ------------------- | ------------------------------------------------------ | ----------------------------- |
| `task test:issue`   | [`local/issue.yml`](local/issue.yml)                   | `issues` (issue-opened)       |
| `task test:comment` | [`local/comment.yml`](local/comment.yml)               | `issue_comment`               |
| `task test:review`  | [`local/review-comment.yml`](local/review-comment.yml) | `pull_request_review_comment` |
| `task test:direct`  | [`local/direct.yml`](local/direct.yml)                 | `workflow_dispatch` (direct)  |

These need only Docker + `act` - **no `.env`, token, or provider key**. In `dry-run`
the action forces the bundled mock agent and _simulates_ every GitHub mutation, so a
run prints exactly what it _would_ do:

```text
[dry-run] would add 'eyes' reaction to issues comment #123456 on inference-gateway/infer-action
[dry-run] would create the 'I'm cooking...' comment on issue #1 (https://github.com/.../issues/1)
==========================================
DRY RUN - the agent would be invoked with:
==========================================
Model:        deepseek/deepseek-v4-flash
Context kind: issue
...
--- REMINDERS (INFER_REMINDERS_CONFIG) ---
...
[dry-run] would update the plan zone of comment #999999999 ...
[dry-run] the agent would open a PR for branch fix/issue-1 (none exists in dry-run)
```

The two lines before the banner are printed by the 'Add eyes emoji reaction to
comment' and 'Post initial cooking message' steps, which run before the agent -
the reaction line only appears for `task test:comment` and `task test:review`
(the step is gated on `issue_comment` / `pull_request_review_comment`), not for
`task test:issue`.

GitHub **reads** still run, so the would-be target (issue/PR/comment thread) is real.
With no token they fail-soft - pass one to resolve real reads:

```sh
task test:issue -- -s GITHUB_TOKEN=$(gh auth token)
```

`task test:list` lists the jobs without executing, and `task test:all` runs all four.

## Notes

- **Pin to a release.** These examples reference `inference-gateway/infer-action@main`
  (the latest tip) for clarity. In production, pin to a released tag from the
  [Releases page](https://github.com/inference-gateway/infer-action/releases) so
  your workflow is reproducible.
- **Secrets.** Add the provider API key(s) for the model you choose under
  _Settings → Secrets and variables → Actions_ (for example `DEEPSEEK_API_KEY`,
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`), and set the
  `DEFAULT_MODEL` repository variable to your `provider/model`.
- **GitHub App token.** The examples mint a token from a GitHub App
  (`actions/create-github-app-token` with `APP_CLIENT_ID`/`APP_PRIVATE_KEY`
  secrets) so the agent's pushes and PRs are attributed to your bot and can
  trigger downstream workflows - the default `GITHUB_TOKEN` cannot. If you
  don't have an App, replace the token references with
  `${{ secrets.GITHUB_TOKEN }}` and drop the `github-app-slug` line.
- **Time budget.** These examples leave `time-budget-minutes` off on purpose - each one is a minimal feature
  demo, and a budget only pays off on long runs. When you add one, set the job's `timeout-minutes` first and
  keep `time-budget-minutes` under it so the salvage and report steps still run inside the job, and under 60
  for these workflows - the `create-github-app-token` token they mint lives one hour.
  [`with-time-budget.yml`](with-time-budget.yml) shows the wiring and reads the action's `outputs`.
- **Permissions.** Grant only what the mode needs: `contents: write` and
  `pull-requests: write` for runs that open PRs, and `issues: write` to post the
  progress/result comment. `contents: read` is enough for advisory mode.
- **Checkout first.** The agent operates on the checked-out repository, so every
  example runs `actions/checkout` before the action.

See the [top-level README](../README.md) for the full input/output reference.

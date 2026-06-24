# Examples

Copy-paste workflow files that demonstrate the features of
[`inference-gateway/infer-action`](../README.md). Each file is a complete,
self-contained GitHub Actions workflow - drop one into your repository's
`.github/workflows/` directory and adjust the `model`, provider key, and
secrets to taste.

> These files live under `examples/` rather than `.github/workflows/`, so GitHub
> does **not** run them from this repository - they are documentation only.

## Index

| Example                                                            | Demonstrates                                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [`issue-agent.yml`](issue-agent.yml)                               | The default flow: `@infer` on an issue/comment → branch + PR                              |
| [`direct-prompt.yml`](direct-prompt.yml)                           | Manual `workflow_dispatch` run from a free-text prompt (the `direct-prompt` input)        |
| [`direct-prompt-model-choice.yml`](direct-prompt-model-choice.yml) | A manual run with a model-picker dropdown, composing `direct-prompt` with model selection |
| [`comment-only-advisor.yml`](comment-only-advisor.yml)             | Advisory / comment-only mode (`enable-git-operations: false`) - no commits or PRs         |
| [`with-skills.yml`](with-skills.yml)                               | Installing Infer skills and appending `custom-instructions`                               |
| [`with-agents.yml`](with-agents.yml)                               | Spinning up A2A agents as local Docker containers (the `agents` input)                    |
| [`node-project.yml`](node-project.yml)                             | A custom trigger phrase plus an extended bash allow-list for a Node.js project            |

## Testing locally with `act`

The workflows above reference the **published** action, so they're copy-paste ready
but can't be run against your local checkout. For that, the
[`local/`](local) directory holds three thin workflows that run the
**working-tree** action (`uses: ./`) with [`dry-run: true`](../README.md#dry-run--local-testing),
wired to [`act`](https://github.com/nektos/act) via `task`:

| Command             | Workflow                                 | Event                        |
| ------------------- | ---------------------------------------- | ---------------------------- |
| `task test:issue`   | [`local/issue.yml`](local/issue.yml)     | `issues` (issue-opened)      |
| `task test:comment` | [`local/comment.yml`](local/comment.yml) | `issue_comment`              |
| `task test:direct`  | [`local/direct.yml`](local/direct.yml)   | `workflow_dispatch` (direct) |

These need only Docker + `act` - **no `.env`, token, or provider key**. In `dry-run`
the action forces the bundled mock agent and _simulates_ every GitHub mutation, so a
run prints exactly what it _would_ do:

```text
==========================================
DRY RUN - the agent would be invoked with:
==========================================
Model:        deepseek/deepseek-v4-flash
Context kind: issue
...
--- REMINDER ---
...
[dry-run] would add 'eyes' reaction to comment #123456 on inference-gateway/infer-action
[dry-run] would create the 'I'm cooking...' comment on issue #1 (https://github.com/.../issues/1)
[dry-run] would update the plan zone of comment #999999999 ...
[dry-run] the agent would open a PR for branch fix/issue-1 (none exists in dry-run)
```

GitHub **reads** still run, so the would-be target (issue/PR/comment thread) is real.
With no token they fail-soft; pass one to resolve real reads:

```sh
task test:issue -- -s GITHUB_TOKEN=$(gh auth token)
```

`task test:list` lists the jobs without executing; `task test:all` runs all three.

## Notes

- **Pin to a release.** These examples reference `inference-gateway/infer-action@main`
  (the latest tip) for clarity. In production, pin to a released tag from the
  [Releases page](https://github.com/inference-gateway/infer-action/releases) so
  your workflow is reproducible - note that `direct-prompt` requires `v0.11.0` or
  newer.
- **Secrets.** Add the provider API key(s) for the model you choose under
  _Settings → Secrets and variables → Actions_ (for example `DEEPSEEK_API_KEY`,
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`). `GITHUB_TOKEN` is
  provided automatically by GitHub Actions.
- **Permissions.** Grant only what the mode needs: `contents: write` and
  `pull-requests: write` for runs that open PRs; `issues: write` to post the
  progress/result comment; `contents: read` is enough for advisory mode.
- **Checkout first.** The agent operates on the checked-out repository, so every
  example runs `actions/checkout` before the action.

See the [top-level README](../README.md) for the full input/output reference.

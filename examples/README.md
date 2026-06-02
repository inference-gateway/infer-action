# Examples

Copy-paste workflow files that demonstrate the features of
[`inference-gateway/infer-action`](../README.md). Each file is a complete,
self-contained GitHub Actions workflow — drop one into your repository's
`.github/workflows/` directory and adjust the `model`, provider key, and
secrets to taste.

> These files live under `examples/` rather than `.github/workflows/`, so GitHub
> does **not** run them from this repository — they are documentation only.

## Index

| Example                                                            | Demonstrates                                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [`issue-agent.yml`](issue-agent.yml)                               | The default flow: `@infer` on an issue/comment → branch + PR                              |
| [`direct-prompt.yml`](direct-prompt.yml)                           | Manual `workflow_dispatch` run from a free-text prompt (the `direct-prompt` input)        |
| [`direct-prompt-model-choice.yml`](direct-prompt-model-choice.yml) | A manual run with a model-picker dropdown, composing `direct-prompt` with model selection |
| [`comment-only-advisor.yml`](comment-only-advisor.yml)             | Advisory / comment-only mode (`enable-git-operations: false`) — no commits or PRs         |
| [`with-skills.yml`](with-skills.yml)                               | Installing Infer skills and appending `custom-instructions`                               |
| [`node-project.yml`](node-project.yml)                             | A custom trigger phrase plus an extended bash allow-list for a Node.js project            |

## Notes

- **Pin to a release.** These examples reference `inference-gateway/infer-action@main`
  (the latest tip) for clarity. In production, pin to a released tag from the
  [Releases page](https://github.com/inference-gateway/infer-action/releases) so
  your workflow is reproducible — note that `direct-prompt` requires `v0.11.0` or
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

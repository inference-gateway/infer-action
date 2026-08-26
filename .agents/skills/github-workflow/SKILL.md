---
name: github-workflow
description: >
  Author, install, or update a GitHub Actions workflow that runs the
  OpenTask/Infer agent via inference-gateway/infer-action. Use this whenever a
  task involves creating .github/workflows/tasks.yml, re-installing or syncing
  the OpenTask Agent workflow, bumping the infer-action version, adding
  infer-action inputs, or adapting the agent workflow to a repository's
  languages and CI conventions - even when the request only says "install the
  agent" or "fix the workflow".
license: Apache-2.0
---

# infer-action workflow authoring

Use this skill when creating or updating a GitHub Actions workflow that runs
the OpenTask/Infer agent (`inference-gateway/infer-action`).

## Read in this order

1. **The bundled examples** in [`examples/`](examples/) - they are the
   canonical usage patterns for infer-action, copied from the action's own
   `examples/` directory. Pick the ones matching the task:

   | Example                          | Demonstrates                                                                     |
   | -------------------------------- | -------------------------------------------------------------------------------- |
   | `issue-agent.yml`                | The default flow: trigger phrase on an issue/comment → branch + PR               |
   | `direct-prompt.yml`              | Manual `workflow_dispatch` run from a free-text prompt                           |
   | `direct-prompt-model-choice.yml` | Manual run with a model-picker input                                             |
   | `comment-only-advisor.yml`       | Advisory mode (`enable-git-operations: false`)                                   |
   | `node-project.yml`               | Custom trigger phrase + extended bash allow-list for a language-specific project |
   | `with-skills.yml`                | Installing skills and appending `custom-instructions`                            |
   | `with-agents.yml`                | Spinning up A2A agents (the `agents` input)                                      |
   | `with-plugins.yml`               | Pre-installing infer-action plugins                                              |
   | `with-inline-review.yml`         | Inline PR review comments (`review-inline`)                                      |
   | `with-memory.yml`                | Persistent cross-run agent memory                                                |

2. **The existing workflow in the target repository**, if there is one
   (usually `.github/workflows/tasks.yml`, sometimes `infer.yml`, or any
   workflow that uses `inference-gateway/infer-action`). Read it completely
   before changing anything.

3. **The repository itself**: its languages, and its CI workflow
   (`.github/workflows/ci.yml` or similar) for the conventions the repo
   already follows - setup steps, action version style, GitHub App token
   usage, package managers.

Only then make changes.

## Updating an existing workflow

The file you are editing was usually customized for its repository: extra
build/setup steps, a GitHub App token, `languages`/`apt` settings, plugins,
agents, extended `bash-allow-append` entries, `debug`/`review-inline` flags,
custom instructions. Those customizations are the most valuable part of the
file - a "sync" that regenerates the workflow from a generic template destroys
them and breaks the repo's agent runs.

So apply **only** infer-action-related changes:

- Bump `inference-gateway/infer-action` to the latest release.
- Add `workflow_dispatch` inputs and `with:` attributes the current file is
  missing (compare against the examples - e.g. `prompt`, `system_prompt`,
  model picker, `enable_git`, `agents`).
- Never remove or rewrite anything repo-specific. When unsure whether a line
  is repo-specific, keep it.

## Creating a new workflow

Create `.github/workflows/tasks.yml` modeled on the examples, tailored to the
repository:

- Triggers: `issues` (opened, edited), `issue_comment` (created),
  `pull_request_review_comment` (created), plus `workflow_dispatch` with
  `model`, `prompt`, `system_prompt`, `enable_git`, and `agents` inputs.
- `trigger-phrase: "@opentask"` unless the repo already uses another phrase.
- `permissions`: `issues: write`, `contents: write`, `pull-requests: write`.
- Pass every provider API key secret through to the action (see
  `direct-prompt-model-choice.yml` for the full block, plus
  `llamacpp-api-url`/`llamacpp-api-key` for self-hosted endpoints), and
  default the model from `${{ inputs.model || vars.DEFAULT_MODEL || '<default>' }}`.
- Add `languages:` and setup steps matching the repository's actual languages
  so the agent can build and test the project, and extend
  `bash-allow-append` with that toolchain (see `node-project.yml`).
- Use a GitHub App token step (`actions/create-github-app-token`) when the
  repo's other workflows do, feeding its token to checkout and `github-token`.
- Write clean YAML with no comments - the file is configuration, not
  documentation.

## Rules for both

- Pin every action to its latest release with an explicit
  `v<major>.<minor>.<patch>` tag (e.g. `actions/checkout@v7.0.1`). Floating
  majors like `@v4` change under the repo without review; unpinned `@main` is
  worse. Match or exceed the versions the repo's own CI already uses.
- No "generated by" or AI-attribution footers in the workflow, commits, or PR.
- When the change lands as a pull request, give it a Conventional Commit title
  (`ci: ...`) and a body that states exactly what changed in the workflow and
  why - a reader should not need the diff to understand the change.

<div align="center">

# Infer Agent Action

A GitHub Action that automatically runs the
[Infer CLI](https://github.com/inference-gateway/cli) agent on GitHub issues.
The agent can analyze issues, provide solutions, and post results as comments
using various AI providers (Anthropic, OpenAI, Google, Ollama, Ollama Cloud,
Groq, Moonshot and more).

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![GitHub release](https://img.shields.io/github/v/release/inference-gateway/infer-action)](https://github.com/inference-gateway/infer-action/releases)
[![GitHub issues](https://img.shields.io/github/issues/inference-gateway/infer-action)](https://github.com/inference-gateway/infer-action/issues)

</div>

## Features

- 🤖 Automatically trigger AI agents on GitHub issues
- 🔄 Support for multiple AI providers (Anthropic Claude, OpenAI GPT, Google Gemini)
- 🎯 Customizable trigger phrases
- 🔀 Dynamic model selection - override the default model per-issue or per-comment
- 📝 Automatic comment posting with results and progress tracking
- 🔀 Automatic pull request creation when file changes are made
- ⚙️ Configurable agent behavior and iteration limits
- 🚀 Easy setup with minimal configuration

## Quick Start

Create a workflow file (e.g., `.github/workflows/infer-agent.yml`):

```yaml
name: Infer Agent

on:
  issues:
    types:
      - opened
      - edited
  issue_comment:
    types:
      - created
  pull_request_review_comment:
    types:
      - created

jobs:
  run-agent:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.0

      - uses: inference-gateway/infer-action@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          model: deepseek/deepseek-v4-flash
          deepseek-api-key: ${{ secrets.DEEPSEEK_API_KEY }}
```

## Usage Examples

### Basic Usage with Anthropic Claude

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4-6
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Using OpenAI GPT-5

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: openai/gpt-5
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

### Using Google Gemini 3

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: google/gemini-3-pro
    google-api-key: ${{ secrets.GOOGLE_API_KEY }}
```

### Custom Trigger Phrase

By default, the action triggers on `@infer`. You can customize this:

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4-6
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    trigger-phrase: "@ai-helper"
```

### Dynamic Model Selection

You can override the default model on a per-issue or per-comment basis using the `/model`
parameter. This allows you to experiment with different models without changing your workflow
configuration.

**Usage in issue comments:**

```text
@infer /model deepseek/deepseek-v4-flash can you explain what this project does?
```

**Usage in issue bodies:**

```text
@infer /model openai/gpt-5 please analyze this bug and suggest a fix
```

**Supported model format:**

The model parameter accepts any valid model identifier in the format `provider/model-name`, such as:

- `anthropic/claude-sonnet-4-6`
- `openai/gpt-5`
- `google/gemini-3-pro`
- `deepseek/deepseek-v4-flash`
- `ollama_cloud/qwen3-coder:480b`
- `moonshot/kimi-k2`

The model specified in the workflow configuration serves as the default when no `/model` parameter is provided.

> **Choosing a model.** Capable models (Sonnet, Opus, GPT-5, Gemini-3-Pro) follow the branch/commit/PR protocol best and produce clean, self-contained PRs.
> Flash/mini tiers (Haiku, GPT-5-mini, Gemini-3-Flash) are faster and cheaper but more often skip the git workflow, leaning on the salvage net to rescue their work.
> For production repos where PR quality matters, prefer a capable model; for triage, Q&A, and lightweight tasks the flash tiers are a good fit.

### Limiting Agent Iterations

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: deepseek/deepseek-v4-flash
    deepseek-api-key: ${{ secrets.DEEPSEEK_API_KEY }}
    max-turns: 30
```

### Using Specific CLI Version

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4-6
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    version: v0.112.2
```

### Adding Custom Instructions

The action includes comprehensive default instructions for the agent that cover:

- Creating and posting a plan with todos
- Real-time progress updates
- Making file changes
- Creating branches and commits
- Opening pull requests
- Posting results with PR links

You can provide **additional** project-specific instructions that will be appended to the defaults:

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: deepseek/deepseek-v4-flash
    deepseek-api-key: ${{ secrets.DEEPSEEK_API_KEY }}
    custom-instructions: |
      - Always run tests before committing changes
      - Follow the project's coding style guide in CONTRIBUTING.md
      - Add JSDoc comments for any new functions
      - Update relevant documentation when making changes
```

The custom instructions enhance the agent's behavior without replacing the core workflow.

### Overriding System Prompts

For full control, the `system-prompt-*` inputs replace the bundled system
prompts entirely:

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: deepseek/deepseek-v4-flash
    deepseek-api-key: ${{ secrets.DEEPSEEK_API_KEY }}
    system-prompt-issue: |
      You are an agent for issue #{{issueNumber}}.
      <your full instructions here>
```

> **Warning:** These inputs **replace**, not merge with, the bundled defaults.
> The defaults carry a git-safety block (branch-first, commit-per-todo, push,
> draft PR, finish checklist) that guards against lost work on the ephemeral
> runner. An override that omits those instructions silently drops that guard.
> When `enable-git-operations` is true the action emits a `::warning::` in the
> run log listing the missing git-safety markers so the drop is visible. Prefer
> `custom-instructions` to layer extras on top of the default unless you need a
> complete replacement; if you do replace, re-add the branch/commit/push/PR
> discipline to your text.

### Loading Agent Skills

Infer skills are reusable Markdown packages (a folder with a `SKILL.md` frontmatter file) that the agent
loads on startup and invokes by name. The action can install skills before the agent runs:

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4-6
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    skills: |
      maintainer
      # acme/internal-comms
      # https://github.com/anthropics/skills/tree/main/skills/pdf
```

Each line is passed directly to `infer skills install`, which accepts three forms:

- **Bare skill name** - `maintainer` resolves to `inference-gateway/skills/skills/maintainer/`
- **`<org>/<skill>` pair** - `acme/internal-comms` resolves to `acme/skills/skills/internal-comms/`
- **Full GitHub tree URL** - for any layout, branch, or tag: `https://github.com/<owner>/<repo>/tree/<ref>/<path>`

Lines beginning with `#` are treated as comments. Blank lines are ignored.

**Notes:**

- Skills are installed to `~/.infer/skills/` on the runner (`--user --overwrite`). Your working tree is not modified.
- Providing any skill automatically sets `INFER_AGENT_SKILLS_ENABLED=true` for the agent run.
- Skill discovery and the first-party skill catalog live at [inference-gateway/skills](https://github.com/inference-gateway/skills).
- Skill installs are authenticated with the `github-token` you provide (passed to the CLI as `GITHUB_TOKEN`), so they use the 5,000 requests/hour authenticated limit
  and can reach private repositories the token can access. Without a token, GitHub's 60 requests/hour-per-IP anonymous limit applies and is easily exhausted on shared CI runners.

### Loading Infer Plugins

Infer plugins are Claude Code-format packages (an `AGENTS.md` instructions file plus optional skills) that
extend the agent's capabilities. The action can install plugins before the agent runs:

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4-6
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    plugins: |
      # community plugin
      DietrichGebert/ponytail
      # pinned ref
      my-org/my-plugin@v2.1.0
      # full GitHub URL
      https://github.com/my-org/agent-plugins/tree/v1.0
```

Each line is passed directly to `infer plugins install --yes`, which accepts three forms:

- **`owner/repo`** - `DietrichGebert/ponytail` resolves to `github.com/DietrichGebert/ponytail`
- **`owner/repo@ref`** - pins a specific tag, branch, or commit: `my-org/my-plugin@v2.1.0`
- **Full GitHub URL** - for any layout, branch, or tag: `https://github.com/<owner>/<repo>[/tree/<ref>]`

Lines beginning with `#` are treated as comments. Blank lines are ignored.

**Security model:** Plugins are content-only mapping (skills + instructions). Plugin code
(`hooks/`, `commands/`, `agents/`) is detected by the CLI but never executed or installed.
This is especially important on unattended CI runners - the action inherits this safety
from the CLI.

**Notes:**

- Plugins are installed to `~/.infer/plugins/` on the runner with `--yes` (non-interactive).
  Your working tree is not modified.
- A failing install fails the step with a log line naming the entry.
- After installation, `infer plugins list` is printed to the job log.
- Plugin skills surface through normal skills discovery (scope `plugin`), and each enabled
  plugin's `AGENTS.md` is injected into the system prompt as a labeled
  `PLUGIN INSTRUCTIONS (<name>)` section.
- If the pinned CLI version predates the `infer plugins` subcommand, the install step fails
  loudly, which is acceptable - upgrade the `version` pin.
- No extra wiring is needed beyond the install: plugins are enabled by default in the CLI.

### Spinning up A2A Agents

> **Advanced / experimental.** A2A (Agent-to-Agent) lets the main agent delegate
> sub-tasks to other agents running as **local Docker containers** on the runner.

The `agents` input registers one or more A2A agents before the run, starts them as
containers, and exposes them to the model via the A2A tools:

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4-6
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    agents: |
      browser-agent
      documentation-agent
      # custom image:
      # my-agent=ghcr.io/my-org/my-agent:latest
```

Each comma/newline-separated entry is one of:

- **A first-party agent name the CLI knows** - `browser-agent`, `mock-agent`,
  `google-calendar-agent`, `documentation-agent`, or `n8n-agent`. The CLI resolves
  the OCI image and a localhost URL for you, so the bare name is enough.
- **A `name=oci-image` pair** - registers a custom image on an auto-assigned
  localhost port (e.g. `my-agent=ghcr.io/my-org/my-agent:latest`).

Lines beginning with `#` are comments. Blank lines are ignored.

For each entry the action runs `infer agents add ... --run --model <model>`,
enables it, and sets `INFER_A2A_ENABLED=true` so `infer agent` starts the
containers and can delegate to them. Under the hood this writes the CLI's
project-level `.infer/agents.yaml`, which the action keeps out of the agent's
commits (the "Hide Infer workspace from git" step).

**Notes:**

- **Docker is required** on the runner. The default `ubuntu-24.04` GitHub-hosted
  runner has it pre-installed; the agents run as local containers.
- **Registration is best-effort.** An unknown name or a failed `infer agents add`
  logs a warning and is skipped - it does not fail the run. A missing Docker
  daemon warns rather than aborting.
- **Agents default to the same `model` as the main run** (the model your workflow
  already has a provider key for). For per-agent models, configure
  `.infer/agents.yaml` directly.
- Container lifecycle is managed by the CLI; the action also tears down any
  leftover `inference-agent-*` containers on cleanup, so they do not leak between
  runs on self-hosted runners.

### Bash Commands (allow-list)

The agent runs bash through the Infer CLI's allow-list. As of CLI **v0.121.0** the **CLI owns a
curated read-only baseline** that every run inherits - you no longer configure it here. It
covers file reads (`ls`, `find`, `head`, `tail`, `wc`, `sort`, `uniq`, `tree`), `echo`, `task`,
`make`, read-only git (`git status|branch|log|diff|remote|show`), and read-only `gh` -
**including `gh project list|view|item-list|field-list`** (reading project boards). It contains
no writes.

On top of that baseline:

- When git operations are enabled (the default), the action appends exactly the writes its PR
  workflow needs: `git add/commit/push/checkout/switch/fetch`, `gh pr create`, `gh pr ready`,
  and a scoped `gh pr edit` limited to `--title`/`--body`/`--body-file`. `gh pr merge`,
  `gh pr close`, and `gh pr review` are deliberately **never** appended - the agent opens and
  maintains its own PR but a human reviews and merges.
- Use **`bash-allow-append`** to add your project's tooling. Entries are **Go regexes**, each
  anchored to the whole command, comma- or newline-separated:

```yaml
- uses: inference-gateway/infer-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4-6
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    # Add project tooling on top of the CLI baseline + the action's git-write append:
    bash-allow-append: "npm( .*)?,pnpm( .*)?,node( .*)?,go test( .*)?"
```

> **Migrating from older versions (pre-CLI v0.121.0):** the `bash-whitelist-commands`,
> `bash-whitelist-commands-append`, `bash-whitelist-patterns`, and
> `bash-whitelist-patterns-append` inputs are **removed**, along with the action's own default
> command/pattern lists - the CLI now owns the read-only baseline. Move everything you used to
> append into the single **`bash-allow-append`** input, and rewrite each entry as a **regex
> anchored to the whole command**: a bare command name no longer matches its arguments, so
> `npm` becomes `npm( .*)?` and `^npm .*` becomes `npm( .*)?`. To _replace_ the CLI baseline
> (rather than append to it), configure the CLI's `.infer/config.yaml` directly.

**Security notes:**

- Only allow commands you trust the agent to run.
- Entries are evaluated as regex (comma- or newline-separated; no commas _inside_ a single
  pattern).
- The CLI rejects command chaining, redirects, command substitution, and environment-variable
  expansion in allowed commands, so an allow entry cannot be widened via `;` / `&&` / `$()` /
  `>`.

**Example appends:**

- Node.js projects: `bash-allow-append: "npm( .*)?,pnpm( .*)?,node( .*)?"`
- Python projects: `bash-allow-append: "python3( .*)?,pip( .*)?,pytest( .*)?"`
- Build tools: `bash-allow-append: "cargo( .*)?,cmake( .*)?,mvn( .*)?"`

### Disabling Git Operations (Comment-Only Mode)

By default, the agent can create branches, commits, and pull requests. If you want the agent to only analyze
issues and post comments without making code changes, disable git operations:

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4-6
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    enable-git-operations: false
```

When `enable-git-operations: false`:

- The action does not append the git-write commands or `gh pr create`, so the agent keeps only
  the CLI's read-only baseline (it can still read with `git log` / `gh ... view`, but cannot
  commit, push, or open a PR)
- The agent can only analyze code, provide suggestions, and post comments
- No branches, commits, or pull requests will be created
- Useful for advisory-only workflows or testing the action safely

### Direct Prompt (Manual `workflow_dispatch` Runs)

By default the action triggers from `issues` / `issue_comment` /
`pull_request_review_comment` events and reads the task from the issue or
comment body. To run the agent against a free-text task with
no issue or comment - for example from a manual `workflow_dispatch` form - pass the
text through `direct-prompt`:

```yaml
name: Infer (manual)

on:
  workflow_dispatch:
    inputs:
      prompt:
        description: "Task for the agent to work on"
        required: true
        type: string

permissions:
  contents: write
  pull-requests: write

jobs:
  infer:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.0

      - uses: inference-gateway/infer-action@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          model: deepseek/deepseek-v4-flash
          deepseek-api-key: ${{ secrets.DEEPSEEK_API_KEY }}
          direct-prompt: ${{ inputs.prompt }}
```

When `direct-prompt` is non-empty:

- The agent runs against that text instead of an issue/comment body, so no `issues`
  or `issue_comment` event is required - the action works under `workflow_dispatch`
  (or any event).
- There is no issue/PR thread to reply to, so the agent commits its work to a new
  branch and opens a pull request, then the run's result and the PR link are written
  to the workflow **job summary** (and the PR URL is exposed as the `pr-url` output).
- All other inputs (`model`, `skills`, `max-turns`, `compact-auto-at`,
  `bash-allow-append`, provider keys, `debug`, ...) compose as usual. A `/model`
  override embedded in the prompt is honored, just like in event-driven mode.
- Leave `direct-prompt` empty (the default) and event-driven behavior is unchanged.

When `enable-git-operations: false`, direct-prompt runs in advisory mode: the agent
only writes its findings to the job summary (no branch or PR).

## Persistent Agent Memory

Give the agent a **cross-run memory** backed by a git repository. The Infer CLI stores
durable facts as Markdown files under `~/.infer/memory`; with the git backend enabled
it pulls that directory from a remote at run start and commits + pushes when a fact
changes - so what the agent learns in one issue run is available in the next.

**Opt-in and inert by default.** When `memory-repo` is empty no memory env vars are
set and nothing changes for existing users. The action only surfaces the inputs, wires
up auth for the memory remote, and exports the bot committer identity; the CLI (the
source of truth for defaults and sync behavior) does the actual syncing.

Dedicated memory repo over ssh with a [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys#deploy-keys)
(create the key with write access on the memory repo):

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4-6
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    memory-repo: git@github.com:my-org/agent-memory.git
    memory-deploy-key: ${{ secrets.MEMORY_DEPLOY_KEY }}
```

Or over https with a token (a fine-grained PAT or GitHub App installation token with
`contents: write` on the memory repo):

```yaml
memory-repo: https://github.com/my-org/agent-memory
memory-token: ${{ secrets.MEMORY_TOKEN }}
```

**Lightest setup - a memory branch of the workflow repo itself.** When `memory-repo`
is an https URL on the same GitHub instance and no credential input is set, the action
falls back to `github-token`, which can already write to the workflow repo. No extra
secret needed - just make sure the job has `contents: write`:

```yaml
memory-repo: https://github.com/${{ github.repository }}
memory-branch: agent-memory
```

Details:

- **Auth scoping.** A deploy key is written to `~/.ssh/infer-memory-deploy-key` and
  wired via `core.sshCommand`; a token is applied as a git `insteadOf` rewrite scoped
  to the memory repo URL. Both are removed again in the action's cleanup step, and
  both credentials are auto-masked in logs and redacted from the cooking comment.
- **Identity.** Memory commits are attributed to the same bot identity as the agent's
  code commits: `<github-app-slug>[bot]` when set, else `github-actions[bot]`
  (exported as `GIT_AUTHOR_*`/`GIT_COMMITTER_*`).
- **Defaults live in the CLI.** Branch `main`, pull on start, push on finish, 60s
  per-git-op timeout, commit message `chore(memory): sync`. The `memory-branch` /
  `memory-sync-on-*` inputs override them only when set.
- **Concurrent runs** pushing the same memory remote are reconciled by the CLI's
  push -> pull-rebase -> retry loop; no action-side locking is needed.
- **Sync is best-effort** - a memory pull/push failure logs a warning and never fails
  the run. An empty remote is adopted on first push.
- **Independent of `enable-git-operations`** - memory sync happens inside the CLI
  process, not through the agent's bash allow-list, so it works in comment-only mode
  too.

> Requires Infer CLI >= v0.127.0 (the default `version` pin already satisfies this).

See [`examples/with-memory.yml`](examples/with-memory.yml) for a complete copy-paste
workflow.

## OpenTelemetry Observability

The action passes OpenTelemetry configuration through to the `infer` CLI
subprocess, which emits metrics, traces, and logs natively from real internal
signals. The CLI is fully configurable via the standard OTel environment
variables (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`,
`OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`).

**Disabled by default.** Set `otel-exporter-otlp-endpoint` to enable:

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4-6
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    otel-exporter-otlp-endpoint: http://my-collector:4318
    otel-exporter-otlp-headers: "Authorization=Bearer my-otel-token"
```

### What gets exported

The CLI controls which signals are emitted. By default it exports metrics
(token usage, cost, tool call counts, run outcome, duration). Traces and logs
are available when the CLI supports them (tracked in the CLI repository).

### Resource attributes

The CLI adds GitHub Actions context (actor, repo, run id, workflow url) to
`OTEL_RESOURCE_ATTRIBUTES` automatically. Additional attributes can be passed
via the `otel-resource-attributes` input.

### Best-effort & safe

- Telemetry is emitted by the CLI subprocess; the action never blocks on it.
- The `otel-exporter-otlp-headers` input is secret and auto-masked.
- Honors `dry-run`: the mock agent does not emit real telemetry.

```yaml
name: Infer (manual)

on:
  workflow_dispatch:
    inputs:
      prompt:
        description: "Task for the agent to work on"
        required: true
        type: string

permissions:
  contents: write
  pull-requests: write

jobs:
  infer:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.0

      - uses: inference-gateway/infer-action@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          model: deepseek/deepseek-v4-flash
          deepseek-api-key: ${{ secrets.DEEPSEEK_API_KEY }}
          direct-prompt: ${{ inputs.prompt }}
```

When `direct-prompt` is non-empty:

- The agent runs against that text instead of an issue/comment body, so no `issues`
  or `issue_comment` event is required - the action works under `workflow_dispatch`
  (or any event).
- There is no issue/PR thread to reply to, so the agent commits its work to a new
  branch and opens a pull request, then the run's result and the PR link are written
  to the workflow **job summary** (and the PR URL is exposed as the `pr-url` output).
- All other inputs (`model`, `skills`, `max-turns`, `compact-auto-at`,
  `bash-allow-append`, provider keys, `debug`, ...) compose as usual. A `/model`
  override embedded in the prompt is honored, just like in event-driven mode.
- Leave `direct-prompt` empty (the default) and event-driven behavior is unchanged.

When `enable-git-operations: false`, direct-prompt runs in advisory mode: the agent
only writes its findings to the job summary (no branch or PR).

## Dry-run / Local Testing

Set `dry-run: true` to run the whole action in a **plan-only** mode - ideal for
trying a workflow locally with [`act`](https://github.com/nektos/act) before it
ever runs for real:

```yaml
- uses: ./ # or inference-gateway/infer-action@<tag>
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: deepseek/deepseek-v4-flash
    dry-run: true
```

In dry-run the action:

- **Forces the bundled mock agent** - no real CLI install and no provider token,
  so it composes with any `model` without spending anything.
- **Simulates every GitHub mutation.** Instead of creating/updating a comment, the
  eyes reaction, the "I'm cooking..." comment, comment zones, or the spinner, it
  prints a `[dry-run] would ...` line (e.g. `[dry-run] would create a github issue
comment on issue #1 (https://github.com/owner/repo/issues/1)`). Secret values are
  still redacted in the printed bodies.
- **Prints a DRY RUN banner** with the exact `SYSTEM` / `TASK` / `REMINDER` prompts
  and the resolved bash allow-list append (the entries the action adds on top of the
  CLI's read-only baseline) the agent would receive.
- **Keeps GitHub reads real**, so you see the actual target issue/PR/comment thread.
  Reads degrade gracefully when no token is available (a public-repo read still
  works unauthenticated; otherwise it warns and continues with env-derived data).

Ready-to-run example workflows and the `task test:issue | test:comment | test:direct`
helpers live in [`examples/local/`](examples/local) - see
[examples/README.md](examples/README.md#testing-locally-with-act).

## Complete Workflow Example

```yaml
name: Infer Action

on:
  issues:
    types:
      - opened
      - edited
  issue_comment:
    types:
      - created
  pull_request_review_comment:
    types:
      - created
permissions:
  issues: write
  contents: write
  pull-requests: write

jobs:
  infer:
    runs-on: ubuntu-24.04

    steps:
      - name: Checkout repository
        uses: actions/checkout@v7.0.0

      - name: Run Infer Agent
        uses: inference-gateway/infer-action@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          trigger-phrase: "@infer"
          model: anthropic/claude-sonnet-4-6
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          max-turns: 50
```

## How It Works

1. **Trigger Detection**: The action monitors issues, comments, and inline PR
   review comments for your configured trigger phrase (default: `@infer`).
   Optionally, you can specify a model override using
   `/model provider/model-name` in the trigger message. Context stays lean:
   conversation triggers include the opening body plus the last 3 human
   comments (older ones are summarised as an "N earlier comments omitted"
   note), and a ping on an inline review comment gives the agent only that
   code section (file, line, diff hunk) - when the ping is a reply, the whole
   review thread is included so earlier suggestions stay visible
2. **Skill Loading** (optional): If the `skills` input lists any skills, they
   are installed into the runner's user-global skill directory (`~/.infer/skills/`)
   and enabled for the agent
3. **A2A Agent Setup** (optional): If the `agents` input lists any A2A agents,
   they are registered and enabled, A2A is turned on, and `infer agent` starts
   each one as a local Docker container the model can delegate to (see
   [Spinning up A2A Agents](#spinning-up-a2a-agents))
4. **Plan Creation**: The agent uses TodoWrite to track its plan; the action's
   runner mirrors the todos to the issue comment in real time as the agent
   makes progress
5. **Agent Execution**: The agent runs with your specified model (or the
   override model if provided). For code-change requests, the agent creates
   the `fix/issue-{number}` working branch and pushes it _before_ any file
   edits, then commits and pushes after each completed todo so partial work
   survives even if the run is cut short. The runner configures the CLI's
   native reminders (passed via `INFER_REMINDERS_CONFIG` with `merge: true`,
   CLI >= v0.130.0): a periodic nudge to keep the branch, draft PR, and pushes
   current, a wrap-up reminder near the turn limit telling the agent to commit
   and push everything now, and a `post_tool` `on_failure` nudge that re-states
   the "a failed call means the change did not happen" rule after each _failed_
   tool call on writable runs. These merge onto the CLI's built-in defaults, so
   the built-in todo-hygiene and memory reminders stay intact. Power users can
   pass a full `reminders-config` YAML to take over entirely
6. **Pull Request Creation**: The agent opens its own pull request with
   `gh pr create --body-file` (writing the description to a file first to avoid
   shell-quoting problems) once its work is committed and pushed. After the
   agent exits, the `recover` step looks up the open PR for the branch and adds
   its URL to the issue comment; if the agent left a thin body (e.g. a bare
   `Fixes #{number}`), it backfills a real summary from the commit log.
   The agent is blocked from merging, closing, editing, or reviewing PRs
7. **Result Posting**: The action posts a final summary to the same issue
   comment with:
   - Status icon (success / failure) and exit code
   - The agent's final response, shown as a visible (non-collapsed) section
     directly under the status header
   - The model that was used
   - Token usage for the run (prompt / completion / total, plus request count)
   - Per-session cost for the run (input / output / total), when the CLI reports pricing
   - Total tool calls made, with the run's success rate
   - Any failed tool calls (collapsed)

## Pull Request Workflow

When the agent needs to make code changes to resolve an issue, the agent owns
the git/PR flow on the happy path - with an `always()` **recover step** as a
model-independent safety net that recovers the work if the agent skips it (or if
the job times out before it finishes):

1. **Agent creates the working branch** `fix/issue-{number}` and pushes it
   _before_ any file edits - this is the first thing the agent does for any
   code-change request, so partial progress is recoverable if the run ends
   early
2. **Agent commits and pushes after each completed todo** - using
   Conventional Commits - rather than batching everything to the end, after
   running the repo's own checks (lint / format / tests) and fixing failures
3. **Agent opens the pull request** with `gh pr create --body-file` once its
   work is pushed, writing the description to a file first (to avoid
   shell-quoting problems) - the title plus a real body (`Resolves #{number}`,
   a `## Summary`, and a `## Changes` list)
4. **The recover step links the PR** in the issue comment by looking up the open
   PR for the branch after the agent exits. As a safety net it backfills the PR
   body from the commit log when the agent left it thin (empty or a bare
   `Fixes #{number}`)
5. **The salvage step rescues unpushed work on every outcome** - when a weak
   model skips the flow above, when the job times out mid-run, _and when the
   agent exits "successfully" without ever pushing_. If the agent edited files
   but never branched/committed/pushed/opened a PR (or left commits unpushed),
   it commits the work onto a `fix/issue-{number}` branch (never
   `main`/`master`), pushes it, and opens a **draft** PR titled `… (salvaged)` -
   so your work is never lost just because the model ignored its instructions
   or the run was cut short. On a pull-request run it pushes the leftover work
   to the existing PR branch instead. It never opens a duplicate (an existing
   open/merged/closed PR for the branch blocks creation) and never merges.
   Because it runs as an `always()` step it survives a job `timeout-minutes`
   cancellation that kills the agent mid-run. A salvaged run is reported as a
   ⚠️ stopped-early status, never ✅ (see the `stopped-early` / `timed-out`
   outputs)

The runner is ephemeral: the branch-first / commit-per-todo discipline plus the
`always()` recover step are what make the workflow resilient to mid-run
termination, job `timeout-minutes` cancellations, max-turns limits, and provider
errors. Because CI runs only _after_ the job ends, the agent runs the
repo's checks locally before committing rather than relying on CI feedback it
can't see.

### Required Permissions

For the pull request workflow to work, your workflow must have these permissions:

```yaml
permissions:
  issues: write # Post comments and read issue details
  contents: write # Create branches and commit changes
  pull-requests: write # Create pull requests
```

## Inputs

| Input                         | Description                                                                                                                                                                                                                                                                                                                                                | Required | Default        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- |
| `github-token`                | GitHub token for API access                                                                                                                                                                                                                                                                                                                                | Yes      | -              |
| `github-app-slug`             | Slug of the GitHub App whose bot identity authors the agent's commits (e.g. `infer-bot`); resolved via `GET /users/{slug}[bot]`. Falls back to `github-actions[bot]` when empty or on failure                                                                                                                                                              | No       | `''`           |
| `trigger-phrase`              | Phrase to trigger the agent                                                                                                                                                                                                                                                                                                                                | No       | `@infer`       |
| `direct-prompt`               | Free-text task to run directly (bypasses issue/comment triggers; enables `workflow_dispatch` runs)                                                                                                                                                                                                                                                         | No       | `''`           |
| `model`                       | AI model to use                                                                                                                                                                                                                                                                                                                                            | Yes      | -              |
| `version`                     | Infer CLI version to install                                                                                                                                                                                                                                                                                                                               | No       | `v0.128.0`     |
| `ollama-api-key`              | Ollama API key                                                                                                                                                                                                                                                                                                                                             | No\*     | -              |
| `ollama-cloud-api-key`        | Ollama Cloud API key                                                                                                                                                                                                                                                                                                                                       | No\*     | -              |
| `groq-api-key`                | Groq API key                                                                                                                                                                                                                                                                                                                                               | No\*     | -              |
| `openai-api-key`              | OpenAI API key                                                                                                                                                                                                                                                                                                                                             | No\*     | -              |
| `cloudflare-api-key`          | Cloudflare API key                                                                                                                                                                                                                                                                                                                                         | No\*     | -              |
| `cohere-api-key`              | Cohere API key                                                                                                                                                                                                                                                                                                                                             | No\*     | -              |
| `anthropic-api-key`           | Anthropic API key                                                                                                                                                                                                                                                                                                                                          | No\*     | -              |
| `deepseek-api-key`            | DeepSeek API key                                                                                                                                                                                                                                                                                                                                           | No\*     | -              |
| `google-api-key`              | Google API key                                                                                                                                                                                                                                                                                                                                             | No\*     | -              |
| `mistral-api-key`             | Mistral API key                                                                                                                                                                                                                                                                                                                                            | No\*     | -              |
| `minimax-api-key`             | MiniMax API key                                                                                                                                                                                                                                                                                                                                            | No\*     | -              |
| `moonshot-api-key`            | Moonshot API key                                                                                                                                                                                                                                                                                                                                           | No\*     | -              |
| `nvidia-api-key`              | Nvidia API key                                                                                                                                                                                                                                                                                                                                             | No\*     | -              |
| `zai-api-key`                 | Zai API key                                                                                                                                                                                                                                                                                                                                                | No\*     | -              |
| `max-turns`                   | Maximum agent iterations                                                                                                                                                                                                                                                                                                                                   | No       | `150`          |
| `custom-instructions`         | Additional instructions appended to default behavior                                                                                                                                                                                                                                                                                                       | No       | `''`           |
| `reminders-config`            | Verbatim reminders YAML passed to the CLI via `INFER_REMINDERS_CONFIG`, REPLACING the composed default. Use to take full control of the CLI's native reminders (hooks, triggers, cadences). Add `merge: true` to layer onto the CLI's built-in defaults instead of replacing them. Needs CLI >= v0.130.0; see the CLI `config/reminders.go` for the schema | No       | `''`           |
| `skills`                      | Newline-separated list of skills installed via `infer skills install`. Auto-enables skills.                                                                                                                                                                                                                                                                | No       | `''`           |
| `plugins`                     | Newline-separated list of plugins installed via `infer plugins install --yes`. Content-only mapping (skills + instructions); plugin code is never executed. See [Loading Infer Plugins](#loading-infer-plugins)                                                                                                                                            | No       | `''`           |
| `agents`                      | Comma/newline-separated list of A2A agents to run as local Docker containers (first-party names like `browser-agent`, or `name=oci-image` pairs). Registers + enables each, turns on A2A, and defaults them to the main `model`. Requires Docker. See [Spinning up A2A Agents](#spinning-up-a2a-agents)                                                    | No       | `''`           |
| `bash-allow-append`           | Go regex entries appended to the CLI's read-only bash allow-list (e.g., `npm( .*)?,pnpm( .*)?`); each is anchored to the whole command. See [Bash Commands](#bash-commands-allow-list)                                                                                                                                                                     | No       | `''`           |
| `web-fetch-domains`           | Domains the WebFetch tool may use; passed as the `INFER_TOOLS_WEB_FETCH_ALLOWED_DOMAINS` env var (maps to `tools.web_fetch.allowed_domains`, replaces the CLI default). Empty = `github.com,raw.githubusercontent.com,api.github.com`                                                                                                                      | No       | `''`           |
| `memory-repo`                 | Git remote URL backing the agent's persistent cross-run memory (ssh or https). Enables the CLI's memory git backend: pull on run start, commit + push when a fact changes. Empty = feature off. See [Persistent Agent Memory](#persistent-agent-memory)                                                                                                    | No       | `''`           |
| `memory-branch`               | Branch of `memory-repo` to sync (`INFER_MEMORY_BACKEND_GIT_BRANCH`). Empty = CLI default (`main`)                                                                                                                                                                                                                                                          | No       | `''`           |
| `memory-sync-on-start`        | Pull memory at run start: `pull` or `off` (`INFER_MEMORY_BACKEND_GIT_SYNC_ON_START`). Empty = CLI default (`pull`)                                                                                                                                                                                                                                         | No       | `''`           |
| `memory-sync-on-finish`       | Push memory changes at run finish: `push` or `off` (`INFER_MEMORY_BACKEND_GIT_SYNC_ON_FINISH`). Empty = CLI default (`push`)                                                                                                                                                                                                                               | No       | `''`           |
| `memory-deploy-key`           | SSH private key (e.g. a deploy key with write access) authenticating an ssh `memory-repo`. Secret, auto-masked. See [Persistent Agent Memory](#persistent-agent-memory)                                                                                                                                                                                    | No       | `''`           |
| `memory-token`                | Token authenticating an https `memory-repo` (scoped git insteadOf rewrite). Secret, auto-masked. Empty on a same-instance https URL = falls back to `github-token`                                                                                                                                                                                         | No       | `''`           |
| `enable-git-operations`       | Enable git operations and PR creation. Set to `false` for comment-only mode                                                                                                                                                                                                                                                                                | No       | `true`         |
| `debug`                       | Enable debug logs and stdout stream events (reminder injection, compaction triggers)                                                                                                                                                                                                                                                                       | No       | `false`        |
| `compact-auto-at`             | Auto-compaction threshold as % of model context window. Valid range 20-100                                                                                                                                                                                                                                                                                 | No       | `50`           |
| `mirror-agent-logs`           | Mirror the agent's verbose stdout transcript to the workflow log; defaults to false (suppressed). Set true to mirror it. stderr (crashes, stack-traces) is always mirrored regardless. The `/tmp/agent-output.txt` file that post-results reads for the comment footer is always written. A minimal heartbeat still prints.                                | No       | `false`        |
| `dry-run`                     | Plan-only local-testing mode: forces the bundled mock agent, simulates every GitHub mutation (`[dry-run] would ...`), prints the SYSTEM/TASK/REMINDER prompts and bash allow-list; reads run                                                                                                                                                               | No       | `false`        |
| `mock-agent-scenario`         | Mock scenario the bundled mock agent runs when `dry-run: true` - `happy`, `failures`, `no-todos`, or `empty`                                                                                                                                                                                                                                               | No       | `happy`        |
| `otel-exporter-otlp-endpoint` | OpenTelemetry OTLP HTTP endpoint (e.g. `http://localhost:4318`). Empty = disabled (default). Passed through to the `infer` CLI subprocess. Maps to `OTEL_EXPORTER_OTLP_ENDPOINT`.                                                                                                                                                                          | No       | `''`           |
| `otel-exporter-otlp-headers`  | Comma-separated key=value headers for OTLP HTTP requests (e.g. `Authorization=Bearer my-token`). Secret, auto-masked. Passed through to the `infer` CLI subprocess. Maps to `OTEL_EXPORTER_OTLP_HEADERS`.                                                                                                                                                  | No       | `''`           |
| `otel-service-name`           | Value for the `service.name` resource attribute. Defaults to `infer-action`. Passed through to the `infer` CLI subprocess. Maps to `OTEL_SERVICE_NAME`.                                                                                                                                                                                                    | No       | `infer-action` |
| `otel-resource-attributes`    | Extra resource attributes in `key=val,key2=val2` format. Passed through to the `infer` CLI subprocess. Maps to `OTEL_RESOURCE_ATTRIBUTES`. The CLI also adds GitHub Actions context automatically.                                                                                                                                                         | No       | `''`           |

\* Required if using the corresponding provider

## Outputs

| Output                    | Description                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `result`                  | Human-readable result message                                                                                                                             |
| `exit-code`               | Exit code from the agent command (normalised to `0` on a job-timeout stop, where the work is recovered)                                                   |
| `pr-url`                  | URL of the pull request the agent opened, or the draft PR the recover step opened for left-behind work (empty if none)                                    |
| `run-duration-ms`         | Wall-clock duration of the agent run in milliseconds (0 if unavailable)                                                                                   |
| `stopped-early`           | `true` if the agent stopped before finishing (unfinished todos, uncommitted or unpushed work, a job-timeout stop, or work the salvage step had to rescue) |
| `timed-out`               | `true` if the job hit its `timeout-minutes` before the agent finished - work is recovered into a draft PR and reported as ⚠️ stopped early, not a failure |
| `failed-tool-calls-count` | Number of failed tool calls detected in agent output                                                                                                      |
| `total-tool-calls-count`  | Total number of tool calls made by the agent                                                                                                              |

## Supported Models

- **Anthropic**: `anthropic/claude-sonnet-4-6`, `anthropic/claude-opus-4-8`, etc.
- **OpenAI**: `openai/gpt-5`, `openai/gpt-5-mini`
- **Google**: `google/gemini-3-pro`, `google/gemini-3-flash`
- **Moonshot**: `moonshot/kimi-k2`, `moonshot/kimi-k2-thinking`, `moonshot/moonshot-v1-128k`

## Security Best Practices

1. **Never commit API keys** - Always use GitHub Secrets
2. **Use minimal permissions** - Only grant necessary workflow permissions
3. **Review agent outputs** - Monitor what the agent posts to your issues
4. **Set appropriate max-turns** - Prevent runaway execution
5. **Carefully extend the bash allow-list** - Only add commands you trust the AI to execute via
   `bash-allow-append`. The CLI's read-only baseline is safe by default

## Setting Up Secrets

1. Go to your repository settings
2. Navigate to "Secrets and variables" → "Actions"
3. Click "New repository secret"
4. Add your API key(s):
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY`
   - `GOOGLE_API_KEY`

## Troubleshooting

### Action doesn't trigger

- Ensure your trigger phrase matches exactly (case-sensitive)
- Check that the workflow has proper event triggers (`issues`, `issue_comment`,
  `pull_request_review_comment`)
- Verify workflow permissions include `issues: write`

### Agent fails to run

- Check that the correct API key is provided for your chosen model
- Verify the model name is correct
- Review the action logs for specific error messages

### Comments not posting

- Ensure `github-token` has write permissions
- Check that the workflow has `issues: write` permission

### Pull requests not being created

- Verify the workflow has `contents: write` permission for branch creation
- Ensure the workflow has `pull-requests: write` permission
- Check that the repository allows pull requests from workflows
- Review the action logs for git/gh CLI errors

## License

Apache-2.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

- [Report Issues](https://github.com/inference-gateway/infer-action/issues)
- [CLI Documentation](https://docs.inference-gateway.com/cli)
- [Inference Gateway](https://github.com/inference-gateway/inference-gateway)

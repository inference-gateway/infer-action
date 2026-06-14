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

jobs:
  run-agent:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v6.0.2

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
    model: deepseek/deepseek-v4-flash
    deepseek-api-key: ${{ secrets.DEEPSEEK_API_KEY }}
```

### Using OpenAI GPT-4

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: openai/gpt-4
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

### Using Google Gemini

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: google/gemini-pro
    google-api-key: ${{ secrets.GOOGLE_API_KEY }}
```

### Custom Trigger Phrase

By default, the action triggers on `@infer`. You can customize this:

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4
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
@infer /model openai/gpt-4 please analyze this bug and suggest a fix
```

**Supported model format:**

The model parameter accepts any valid model identifier in the format `provider/model-name`, such as:

- `anthropic/claude-sonnet-4`
- `openai/gpt-4`
- `google/gemini-pro`
- `deepseek/deepseek-v4-flash`
- `ollama_cloud/qwen3-coder:480b`
- `moonshot/kimi-k2`

The model specified in the workflow configuration serves as the default when no `/model` parameter is provided.

### Limiting Agent Iterations

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: deepseek/claude-sonnet-4
    deepseek-api-key: ${{ secrets.DEEPSEEK_API_KEY }}
    max-turns: 30
```

### Using Specific CLI Version

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4
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

### Loading Agent Skills

Infer skills are reusable Markdown packages (a folder with a `SKILL.md` frontmatter file) that the agent
loads on startup and invokes by name. The action can install skills before the agent runs:

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4
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

### Bash Commands (allow-list)

The agent runs bash through the Infer CLI's allow-list. As of CLI **v0.121.0** the **CLI owns a
curated read-only baseline** that every run inherits - you no longer configure it here. It
covers file reads (`ls`, `find`, `head`, `tail`, `wc`, `sort`, `uniq`, `tree`), `echo`, `task`,
`make`, read-only git (`git status|branch|log|diff|remote|show`), and read-only `gh` -
**including `gh project list|view|item-list|field-list`** (reading project boards). It contains
no writes.

On top of that baseline:

- When git operations are enabled (the default), the action appends exactly the writes its PR
  workflow needs: `git add/commit/push/checkout/switch/fetch` and `gh pr create`. `gh pr merge`,
  `gh pr close`, `gh pr edit`, and `gh pr review` are deliberately **never** appended - the
  agent opens its own PR but a human reviews and merges.
- Use **`bash-allow-append`** to add your project's tooling. Entries are **Go regexes**, each
  anchored to the whole command, comma- or newline-separated:

```yaml
- uses: inference-gateway/infer-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4
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
    model: anthropic/claude-sonnet-4
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

By default the action triggers from `issues` / `issue_comment` events and reads the
task from the issue or comment body. To run the agent against a free-text task with
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
      - uses: actions/checkout@v6.0.2

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

Set `dry-run: true` to run the whole action in a **plan-only** mode — ideal for
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

- **Forces the bundled mock agent** — no real CLI install and no provider token,
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
helpers live in [`examples/local/`](examples/local) — see
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
permissions:
  issues: write
  contents: write
  pull-requests: write

jobs:
  infer:
    runs-on: ubuntu-24.04

    steps:
      - name: Checkout repository
        uses: actions/checkout@v6.0.2

      - name: Run Infer Agent
        uses: inference-gateway/infer-action@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          trigger-phrase: "@infer"
          model: anthropic/claude-sonnet-4
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          max-turns: 50
```

## How It Works

1. **Trigger Detection**: The action monitors issues and comments for your
   configured trigger phrase (default: `@infer`). Optionally, you can specify
   a model override using `/model provider/model-name` in the trigger message
2. **Skill Loading** (optional): If the `skills` input lists any skills, they
   are installed into the runner's user-global skill directory (`~/.infer/skills/`)
   and enabled for the agent
3. **Plan Creation**: The agent uses TodoWrite to track its plan; the action's
   runner mirrors the todos to the issue comment in real time as the agent
   makes progress
4. **Agent Execution**: The agent runs with your specified model (or the
   override model if provided). For code-change requests, the agent creates
   the `fix/issue-{number}` working branch and pushes it _before_ any file
   edits, then commits and pushes after each completed todo so partial work
   survives even if the run is cut short. The runner injects a periodic
   reminder to nudge the agent to keep pushing
5. **Pull Request Creation**: The agent opens its own pull request with
   `gh pr create` once its work is committed and pushed, writing a real
   description of the changes. After the agent exits, the runner looks up the
   open PR for the branch and adds its URL to the issue comment. The agent is
   blocked from merging, closing, editing, or reviewing PRs
6. **Result Posting**: The action posts a final summary to the same issue
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
the whole git/PR flow; the runner only surfaces the result:

1. **Agent creates the working branch** `fix/issue-{number}` and pushes it
   _before_ any file edits - this is the first thing the agent does for any
   code-change request, so partial progress is recoverable if the run ends
   early
2. **Agent commits and pushes after each completed todo** - using
   Conventional Commits - rather than batching everything to the end, after
   running the repo's own checks (lint / format / tests) and fixing failures
3. **Agent opens the pull request** with `gh pr create` once its work is
   pushed, writing the title and a real description (`Resolves #{number}` plus
   a summary of the changes)
4. **Runner links the PR** in the issue comment by looking up the open PR for
   the branch after the agent exits. The runner does not open or merge PRs; if
   the agent did not open one, there is simply nothing to link

The runner is ephemeral: the branch-first / commit-per-todo discipline is what
makes the workflow resilient to mid-run termination, max-turns timeouts, and
provider errors. Because CI runs only _after_ the job ends, the agent runs the
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

| Input                   | Description                                                                                                                                                                                                  | Required | Default    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------- |
| `github-token`          | GitHub token for API access                                                                                                                                                                                  | Yes      | -          |
| `github-app-slug`       | Slug of the GitHub App whose bot identity authors the agent's commits (e.g. `infer-bot`); resolved via `GET /users/{slug}[bot]`. Falls back to `github-actions[bot]` when empty or on failure                | No       | `''`       |
| `trigger-phrase`        | Phrase to trigger the agent                                                                                                                                                                                  | No       | `@infer`   |
| `direct-prompt`         | Free-text task to run directly (bypasses issue/comment triggers; enables `workflow_dispatch` runs)                                                                                                           | No       | `''`       |
| `model`                 | AI model to use                                                                                                                                                                                              | Yes      | -          |
| `version`               | Infer CLI version to install                                                                                                                                                                                 | No       | `v0.121.0` |
| `anthropic-api-key`     | Anthropic API key                                                                                                                                                                                            | No\*     | -          |
| `openai-api-key`        | OpenAI API key                                                                                                                                                                                               | No\*     | -          |
| `google-api-key`        | Google API key                                                                                                                                                                                               | No\*     | -          |
| `deepseek-api-key`      | DeepSeek API key                                                                                                                                                                                             | No\*     | -          |
| `groq-api-key`          | Groq API key                                                                                                                                                                                                 | No\*     | -          |
| `mistral-api-key`       | Mistral API key                                                                                                                                                                                              | No\*     | -          |
| `cloudflare-api-key`    | Cloudflare API key                                                                                                                                                                                           | No\*     | -          |
| `cohere-api-key`        | Cohere API key                                                                                                                                                                                               | No\*     | -          |
| `ollama-api-key`        | Ollama API key                                                                                                                                                                                               | No\*     | -          |
| `ollama-cloud-api-key`  | Ollama Cloud API key                                                                                                                                                                                         | No\*     | -          |
| `moonshot-api-key`      | Moonshot API key                                                                                                                                                                                             | No\*     | -          |
| `max-turns`             | Maximum agent iterations                                                                                                                                                                                     | No       | `50`       |
| `custom-instructions`   | Additional instructions appended to default behavior                                                                                                                                                         | No       | `''`       |
| `skills`                | Newline-separated list of skills installed via `infer skills install`. Auto-enables skills.                                                                                                                  | No       | `''`       |
| `bash-allow-append`     | Go regex entries appended to the CLI's read-only bash allow-list (e.g., `npm( .*)?,pnpm( .*)?`); each is anchored to the whole command. See [Bash Commands](#bash-commands-allow-list)                       | No       | `''`       |
| `web-fetch-domains`     | Domains the WebFetch tool may use; written to `tools.web_fetch.allowed_domains` (replaces the CLI default). Empty = `github.com,raw.githubusercontent.com,api.github.com`                                    | No       | `''`       |
| `enable-git-operations` | Enable git operations and PR creation. Set to `false` for comment-only mode                                                                                                                                  | No       | `true`     |
| `debug`                 | Enable debug logs and stdout stream events (reminder injection, compaction triggers)                                                                                                                         | No       | `false`    |
| `compact-auto-at`       | Auto-compaction threshold as % of model context window. Valid range 20-100                                                                                                                                   | No       | `50`       |
| `mirror-agent-logs`     | Mirror agent stdout/stderr to the workflow log; set false to suppress the transcript while keeping `/tmp/agent-output.txt` that post-results reads for the comment footer. A minimal heartbeat still prints. | No       | `true`     |
| `dry-run`               | Plan-only local-testing mode: forces the bundled mock agent, simulates every GitHub mutation (`[dry-run] would ...`), prints the SYSTEM/TASK/REMINDER prompts and bash allow-list; reads run                 | No       | `false`    |
| `mock-agent-scenario`   | Mock scenario the bundled mock agent runs when `dry-run: true` - `happy`, `failures`, `no-todos`, or `empty`                                                                                                 | No       | `happy`    |

\* Required if using the corresponding provider

## Outputs

| Output                    | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `result`                  | Human-readable result message                            |
| `exit-code`               | Exit code from the agent command                         |
| `pr-url`                  | URL of the pull request the agent opened (empty if none) |
| `failed-tool-calls-count` | Number of failed tool calls detected in agent output     |
| `total-tool-calls-count`  | Total number of tool calls made by the agent             |

## Supported Models

- **Anthropic**: `anthropic/claude-sonnet-4`, `anthropic/claude-opus-4`, etc.
- **OpenAI**: `openai/gpt-4`, `openai/gpt-4-turbo`, `openai/gpt-3.5-turbo`
- **Google**: `google/gemini-pro`, `google/gemini-ultra`
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
- Check that the workflow has proper event triggers (`issues`, `issue_comment`)
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

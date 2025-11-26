<div align="center">

# Infer Agent Action

A GitHub Action that automatically runs the
[Infer CLI](https://github.com/inference-gateway/cli) agent on GitHub issues.
The agent can analyze issues, provide solutions, and post results as comments
using various AI providers (Anthropic, OpenAI, Google, Ollama, Ollama Cloud,
Groq and more).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub release](https://img.shields.io/github/v/release/inference-gateway/infer-action)](https://github.com/inference-gateway/infer-action/releases)
[![GitHub issues](https://img.shields.io/github/issues/inference-gateway/infer-action)](https://github.com/inference-gateway/infer-action/issues)

</div>

## Features

- 🤖 Automatically trigger AI agents on GitHub issues
- 🔄 Support for multiple AI providers (Anthropic Claude, OpenAI GPT, Google Gemini)
- 🎯 Customizable trigger phrases
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
      - uses: actions/checkout@v5

      - uses: inference-gateway/infer-action@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          model: deepseek/deepseek-chat
          deepseek-api-key: ${{ secrets.DEEPSEEK_API_KEY }}
```

## Usage Examples

### Basic Usage with Anthropic Claude

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: deepseek/deepseek-chat
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
    version: v0.68.4
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
    model: deepseek/deepseek-chat
    deepseek-api-key: ${{ secrets.DEEPSEEK_API_KEY }}
    custom-instructions: |
      - Always run tests before committing changes
      - Follow the project's coding style guide in CONTRIBUTING.md
      - Add JSDoc comments for any new functions
      - Update relevant documentation when making changes
```

The custom instructions enhance the agent's behavior without replacing the core workflow.

### Whitelisting Additional Bash Commands

By default, the Infer CLI includes a safe set of whitelisted bash commands (like `ls`, `git status`, `make`, etc.).
If your workflow requires additional commands, you can whitelist them:

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    bash-whitelist-commands: npm,yarn,pnpm,node,python3
    bash-whitelist-patterns: "^npm run.*,^yarn .*,^pnpm .*"
```

**Important Security Notes:**

- Commands are added to the existing whitelist (not replacing it)
- Only whitelist commands you trust the AI agent to execute
- Use `bash-whitelist-commands` for simple command names
- Use `bash-whitelist-patterns` for regex patterns that match command variants
- Patterns must be comma-separated and will be evaluated as regex

**Example Use Cases:**

- Node.js projects: `npm,yarn,node`
- Python projects: `python3,pip,pytest`
- Build tools: `cmake,cargo,mvn`
- Testing: `pytest,jest,vitest`

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

- The `git` and `gh` commands are not whitelisted for the agent
- The agent can only analyze code, provide suggestions, and post comments
- No branches, commits, or pull requests will be created
- Useful for advisory-only workflows or testing the action safely

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
        uses: actions/checkout@v5

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
   configured trigger phrase (default: `@infer`)
2. **Plan Creation**: The agent creates a plan with todos and posts it as a
   comment, updating it in real-time as work progresses
3. **Agent Execution**: The agent runs with your specified model, making
   necessary file changes to resolve the issue
4. **Pull Request Creation**: When file changes are made, the agent
   automatically creates a new branch, commits changes, and opens a pull
   request
5. **Result Posting**: The agent posts a final comment with:
   - Summary of completed work
   - Link to the pull request (if file changes were made)
   - Full execution details

## Pull Request Workflow

When the agent needs to make code changes to resolve an issue, it follows this workflow:

1. **Creates a feature branch** named `fix/issue-{number}` based on the issue number
2. **Makes all necessary file changes** using the appropriate tools
3. **Commits the changes** with descriptive commit messages
4. **Pushes the branch** to the remote repository
5. **Opens a pull request** with:
   - Title: `Fix #{number}: brief description`
   - Body: References the original issue with `Resolves #{number}`
   - Base branch: `main` (or your default branch)
6. **Updates the issue comment** with a link to the pull request

This ensures all code changes are reviewable before being merged into your main branch.

### Required Permissions

For the pull request workflow to work, your workflow must have these permissions:

```yaml
permissions:
  issues: write        # Post comments and read issue details
  contents: write      # Create branches and commit changes
  pull-requests: write # Create pull requests
```

## Inputs

| Input | Description | Required | Default |
| ----- | ----------- | -------- | ------- |
| `github-token` | GitHub token for API access | Yes | - |
| `trigger-phrase` | Phrase to trigger the agent | No | `@infer` |
| `model` | AI model to use | Yes | - |
| `version` | Infer CLI version to install | No | `v0.68.4` |
| `anthropic-api-key` | Anthropic API key | No* | - |
| `openai-api-key` | OpenAI API key | No* | - |
| `google-api-key` | Google API key | No* | - |
| `deepseek-api-key` | DeepSeek API key | No* | - |
| `groq-api-key` | Groq API key | No* | - |
| `mistral-api-key` | Mistral API key | No* | - |
| `cloudflare-api-key` | Cloudflare API key | No* | - |
| `cohere-api-key` | Cohere API key | No* | - |
| `ollama-api-key` | Ollama API key | No* | - |
| `ollama-cloud-api-key` | Ollama Cloud API key | No* | - |
| `max-turns` | Maximum agent iterations | No | `50` |
| `custom-instructions` | Additional instructions appended to default behavior | No | `''` |
| `bash-whitelist-commands` | Comma-separated list of bash commands to whitelist (e.g., `npm,yarn,pnpm`) | No | `''` |
| `bash-whitelist-patterns` | Comma-separated regex patterns for bash commands (e.g., `^npm .*,^yarn .*`) | No | `''` |
| `enable-git-operations` | Enable git operations and PR creation. Set to `false` for comment-only mode | No | `true` |

\* Required if using the corresponding provider

## Outputs

| Output      | Description                          |
|-------------|--------------------------------------|
| `result`    | Human-readable result message        |
| `exit-code` | Exit code from the agent command     |

## Supported Models

- **Anthropic**: `anthropic/claude-sonnet-4`, `anthropic/claude-opus-4`, etc.
- **OpenAI**: `openai/gpt-4`, `openai/gpt-4-turbo`, `openai/gpt-3.5-turbo`
- **Google**: `google/gemini-pro`, `google/gemini-ultra`

## Security Best Practices

1. **Never commit API keys** - Always use GitHub Secrets
2. **Use minimal permissions** - Only grant necessary workflow permissions
3. **Review agent outputs** - Monitor what the agent posts to your issues
4. **Set appropriate max-turns** - Prevent runaway execution
5. **Carefully whitelist bash commands** - Only add commands you trust the AI to execute. The default whitelist
   includes safe, read-only commands

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

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

- [Report Issues](https://github.com/inference-gateway/infer-action/issues)
- [CLI Documentation](https://docs.inference-gateway.com/cli)
- [Inference Gateway](https://github.com/inference-gateway/inference-gateway)

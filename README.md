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
- 📝 Automatic comment posting with results
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
    model: anthropic/claude-sonnet-4
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    max-turns: 30
```

### Using Specific CLI Version

```yaml
- uses: inference-gateway/infer-action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    model: anthropic/claude-sonnet-4
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    version: v0.68.2
```

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
  contents: read

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
2. **Agent Execution**: When triggered, it runs the Infer CLI agent with your
   specified model
3. **Result Posting**: The agent's output is automatically posted as a comment
   on the issue
4. **Status Reporting**: Success/failure status is included in the comment

## Inputs

| Input | Description | Required | Default |
| ----- | ----------- | -------- | ------- |
| `github-token` | GitHub token for API access | Yes | - |
| `trigger-phrase` | Phrase to trigger the agent | No | `@infer` |
| `model` | AI model to use | Yes | - |
| `version` | Infer CLI version to install | No | `v0.68.2` |
| `anthropic-api-key` | Anthropic API key | No* | - |
| `openai-api-key` | OpenAI API key | No* | - |
| `google-api-key` | Google API key | No* | - |
| `max-turns` | Maximum agent iterations | No | `50` |

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

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

- [Report Issues](https://github.com/inference-gateway/infer-action/issues)
- [CLI Documentation](https://docs.inference-gateway.com/cli)
- [Inference Gateway](https://github.com/inference-gateway/inference-gateway)

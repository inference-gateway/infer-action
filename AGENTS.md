# AGENTS.md - Infer Action Project Guide

## Project Overview

This is a GitHub Action that automatically runs the
[Infer CLI](https://github.com/inference-gateway/cli) agent on GitHub issues.
The agent can analyze issues, provide solutions, make code changes, create pull
requests, and post progress updates and results as comments using various AI
providers.

**Key Technologies:**

- GitHub Actions
- Infer CLI (AI agent framework)
- Bash scripting
- Multiple AI providers (Anthropic, OpenAI, Google, Ollama, Groq, etc.)

## Architecture and Structure

```text
.
├── action.yml              # GitHub Action definition
├── README.md               # Project documentation
├── cspell.json             # Spell checking configuration
├── .flox/                  # Development environment (Flox)
│   └── env/
│       ├── manifest.toml   # Package dependencies
│       └── manifest.lock
├── .infer/                 # Infer CLI configuration
│   └── config.yaml         # Agent configuration
└── .gitignore              # Git ignore rules
```

## Development Environment Setup

### Prerequisites

- Git
- GitHub account
- API keys for AI providers (optional for development)

### Development Environment

This project uses **Flox** for development environment management:

```bash
# Activate Flox environment
flox activate

# Available tools in Flox environment:
- claude-code (v2.0.50) - AI coding assistant
- nodejs_24 (^24.11)    - Node.js runtime
- act (^0.2.82)         - Local GitHub Actions testing
- curl (^8.17)          - HTTP client
- jq (^1.8.1)           - JSON processor
```

### Local Testing

Use `act` to test GitHub Actions locally:

```bash
act -P ubuntu-24.04=node:24-bullseye
```

## Key Commands

### GitHub Action Development

- **Test locally**: `act -P ubuntu-24.04=node:24-bullseye`
- **Validate action**: Check `action.yml` syntax
- **Test trigger detection**: Simulate issue events

### Code Quality

- **Spell checking**: Uses `cspell` with custom word list
- **Configuration**: See `cspell.json` for allowed words

### No Build System

This project is a GitHub Action and doesn't require traditional build steps.
The action runs directly on GitHub's infrastructure.

## Testing Instructions

### Manual Testing

1. **Trigger Detection**: Test that the action correctly detects trigger phrases
2. **Agent Execution**: Verify Infer CLI installation and execution
3. **Plan Posting**: Ensure the agent posts a plan with todos and updates it in real-time
4. **File Changes**: Verify the agent can make appropriate code changes
5. **Pull Request Creation**: Test that branches are created and PRs are opened when code changes are made
6. **Comment Posting**: Ensure results and PR links are properly posted to issues
7. **Error Handling**: Test various failure scenarios

### Integration Testing

- Create test issues with trigger phrases
- Verify agent responses and comment formatting
- Test different AI providers and models

### Local Testing with Act

```bash
# Test with specific event
act -P ubuntu-24.04=node:24-bullseye -e event.json

# Test with secrets
act -P ubuntu-24.04=node:24-bullseye -s API_KEY=your_key
```

## Project Conventions and Coding Standards

### File Structure

- `action.yml`: Main GitHub Action definition
- Configuration files in root directory
- Development environment managed by Flox

### Code Style

- **Bash Scripts**: Use POSIX-compliant shell scripting
- **YAML**: Follow GitHub Actions best practices
- **JSON**: Standard JSON formatting

### Naming Conventions

- **Variables**: snake_case in bash scripts
- **Inputs**: kebab-case in action.yml
- **Outputs**: kebab-case for GitHub Action outputs

## Important Files and Configurations

### `action.yml`

The main GitHub Action definition containing:

- Input parameters (model, API keys, trigger phrases)
- Action steps (trigger detection, CLI installation, agent execution)
- Output definitions
- Comment posting logic

### `.flox/env/manifest.toml`

Development environment dependencies:

- claude-code: AI coding assistant
- nodejs_24: JavaScript runtime
- act: Local GitHub Actions testing
- curl: HTTP client
- jq: JSON processor

## AI Agent Integration

### Supported AI Providers

- **Anthropic**: Claude models
- **OpenAI**: GPT models
- **Google**: Gemini models
- **Ollama**: Local models
- **Groq**: High-performance models
- **DeepSeek**: DeepSeek models

### Configuration

Agent behavior configured through:

- Model selection
- Maximum iteration limits
- Custom instructions (appended to default behavior)
- API key management

The action provides comprehensive default instructions that include:

- Plan creation and progress tracking
- Real-time comment updates with todos
- File change workflow (create branch, commit, push)
- Pull request creation and linking
- GitHub environment integration

Users can add custom instructions via the `custom-instructions` input to specify project-specific requirements like:

- Running tests before commits
- Following specific coding standards
- Adding documentation or comments
- Additional validation steps

## Security Considerations

### Secrets Management

- Never commit API keys
- Use GitHub Secrets for sensitive data
- Minimal required permissions

### Input Validation

- Validate trigger phrases
- Sanitize user inputs
- Handle malformed responses

## Development Workflow

### 1. Environment Setup

```bash
flox activate
```

### 2. Code Changes

- Edit `action.yml` for feature changes
- Update `README.md` for documentation
- Modify `cspell.json` for spell checking

### 3. Local Testing

```bash
act -P ubuntu-24.04=node:24-bullseye
```

### 4. Validation

- Test trigger detection
- Verify agent execution
- Check comment formatting

### 5. Deployment

- Commit and push changes
- GitHub Actions will automatically run
- Test in target repositories

## Common Tasks for AI Agents

### Understanding the Pull Request Workflow

When the action runs, the agent follows this workflow for code changes:

1. **Create a plan**: Post initial plan as a comment with todos
2. **Update progress**: Continuously update the comment as todos are completed
3. **Make file changes**: Use appropriate tools to modify code
4. **Create branch**: `git checkout -b fix/issue-{number}`
5. **Commit changes**: `git add . && git commit -m "fix: description"`
6. **Push branch**: `git push -u origin fix/issue-{number}`
7. **Create PR**: `gh pr create --title "Fix #{number}: description" --body "Resolves #{number}"`
8. **Post final comment**: Include PR link in the final result

### Adding New AI Provider

1. Add input parameter in `action.yml`
2. Update configuration step
3. Add documentation in `README.md`
4. Test with sample workflow

### Modifying Trigger Logic

1. Update trigger detection in `action.yml`
2. Test with various event types
3. Verify comment posting still works

### Enhancing Output Formatting

1. Modify comment template in `action.yml`
2. Add additional status information
3. Test with different agent outputs

### Testing Pull Request Creation

1. Create a test issue in a repository
2. Add the trigger phrase to trigger the action
3. Monitor that the agent:
   - Posts a plan comment
   - Updates the comment as work progresses
   - Creates a new branch
   - Makes appropriate file changes
   - Opens a pull request
   - Posts the PR link in the final comment

### Working with Custom Instructions

The `custom-instructions` input allows users to extend the default agent behavior. When implementing or testing:

1. **Default instructions are always included**: Plan creation, progress tracking, file changes, and PR workflow
2. **Custom instructions are appended**: They add project-specific requirements without replacing defaults
3. **Use cases for custom instructions**:
   - Enforce testing before commits: "Always run `npm test` before committing"
   - Apply coding standards: "Follow the style guide in CONTRIBUTING.md"
   - Add documentation: "Add JSDoc comments for new functions"
   - Project-specific workflows: "Update the changelog in CHANGELOG.md"

Example in workflow:

```yaml
custom-instructions: |
  - Always run tests before committing changes
  - Follow the project's coding style guide
  - Update relevant documentation
```

## Troubleshooting

### Common Issues

- **Action doesn't trigger**: Check trigger phrase and event types
- **Agent fails**: Verify API keys and model names
- **Comments not posting**: Check GitHub token permissions (needs `issues: write`)
- **Pull requests not created**: Ensure workflow has `contents: write` and `pull-requests: write` permissions
- **Branch creation fails**: Check that the repository allows writes from the GITHUB_TOKEN
- **Local testing fails**: Ensure act is properly configured

### Debug Mode

Enable verbose logging in bash scripts for debugging:

```bash
set -x  # Enable debug mode
# Your script here
set +x  # Disable debug mode
```

## Contributing

### Code Contributions

1. Fork the repository
2. Create a feature branch
3. Make changes with proper testing
4. Submit a pull request

### Documentation Updates

- Update `README.md` for user-facing changes
- Update `AGENTS.md` for developer/agent guidance
- Maintain consistent formatting

---

*This AGENTS.md file provides comprehensive guidance for AI agents working
with the Infer Action project. For user documentation, refer to README.md.*

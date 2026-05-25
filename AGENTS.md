# Repository Guidelines

## Project Structure & Module Organization

This repository ships a GitHub composite Action. The primary implementation is
`action.yml`, which defines inputs, outputs, trigger checks, CLI installation,
agent execution, result comments, and cleanup. User-facing documentation lives in
`README.md`; release notes are in `CHANGELOG.md`. Local workflow test fixtures
are under `.github/workflows/events/`, with the local test workflow at
`.github/workflows/infer.yml`. The `assets/` directory contains public assets
referenced by the action, such as `assets/cooking.gif`. Treat `.infer/` as local
Infer CLI state, not shipped source.

## Build, Test, and Development Commands

- `task setup` creates `.env` from `.env.example` when needed and verifies `act`
  is installed.
- `task lint` runs `markdownlint` across Markdown files and applies fixes.
- `task test:dry-run` lists the local GitHub Actions jobs without executing them.
- `task test:issue` runs the issue-opened fixture through `act`.
- `task test:comment` runs the issue-comment fixture through `act`.
- `task test:all` runs both local event scenarios.
- `task clean` removes temporary test output from `/tmp/agent-output.txt`.

Local action tests require Docker, `act`, and a populated `.env` with required
provider and GitHub credentials.

## Coding Style & Naming Conventions

Keep YAML indentation at two spaces. Use descriptive kebab-case names for action
inputs, step IDs, and workflow fields, matching existing names such as
`github-token`, `max-turns`, and `check-trigger`. Shell in `action.yml` should be
plain Bash with explicit variable names and clear step boundaries. Markdown is
linted with `.markdownlint.json`; line length is 120 characters.

## Testing Guidelines

There is no compile step or unit test runner. Validate behavior by running the
`task test:*` commands against the checked-in event fixtures. When editing
trigger logic, model override parsing, comment handling, or git-operation
controls, test both `issues` and `issue_comment` paths.

## Commit & Pull Request Guidelines

Use Conventional Commits. Recent examples include `docs: Regenerate CLAUDE.md`,
`chore(deps): Add codex and bump infer CLI`, and `ci(deps): Bump ...`. Prefer
`feat:`, `fix:`, `docs:`, `chore:`, or scoped forms like `chore(deps):`.

Pull requests should explain the behavioral change, list local validation
commands run, and link related issues when applicable. Include screenshots only
for visible documentation or asset changes.

## Security & Configuration Tips

Do not commit `.env` or real API keys. Be conservative when changing
`bash-whitelist-commands`, `bash-whitelist-patterns`, or `enable-git-operations`;
these inputs control what the agent can execute in consumer repositories.

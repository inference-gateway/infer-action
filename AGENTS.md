# Repository Guidelines

## Project Structure & Module Organization

This repository ships a GitHub composite Action. The primary implementation is
`action.yml`, which defines inputs, outputs, trigger checks, CLI installation,
agent execution, result comments, and cleanup. User-facing documentation lives in
`README.md`; release notes are in `CHANGELOG.md`. Local workflow test fixtures
are under `.github/workflows/events/`, with the local test workflow at
`.github/workflows/infer.yml`. The `assets/` directory contains public assets
referenced by the action, such as `assets/spinner.svg`. Treat `.infer/` as local
Infer CLI state, not shipped source.

## Build, Test, and Development Commands

- `task setup` checks that `act` and Docker are available and seeds `.env` from
  `.env.example` (optional — the `act` targets below run without it).
- `task lint` runs `markdownlint` across Markdown files and applies fixes.
- `task test:list` lists the local GitHub Actions jobs without executing them.
- `task test:issue` runs the working-tree action (`uses: ./`) against the
  issue-opened fixture through `act` in `dry-run` mode.
- `task test:comment` does the same for the issue-comment fixture.
- `task test:direct` dispatches the direct (workflow_dispatch) workflow in
  dry-run; override the prompt with `task test:direct PROMPT="..."`.
- `task test:all` runs all three local dry-run scenarios.
- `task clean` removes temporary test output from `/tmp/agent-output.txt`.

These `act` targets run the local action via `examples/local/*.yml` in `dry-run`,
so they need only Docker + `act` — no token or `.env` (all GitHub mutations are
simulated and reads fail-soft). Pass a token to resolve real reads with
`-s GITHUB_TOKEN=$(gh auth token)`.

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

# Repository Guidelines

## Project Structure & Module Organization

This repository defines the `inference-gateway/infer-action` composite GitHub Action. The main implementation
lives in `action.yml`; keep input, output, and step behavior changes there. User-facing documentation is in
`README.md`, release notes are in `CHANGELOG.md`, and repository-specific agent guidance is in `CLAUDE.md`.
GitHub workflows live under `.github/workflows/`, with local `act` event fixtures in `.github/workflows/events/`.
Static assets used by the action, such as `assets/cooking.gif`, belong in `assets/`.

## Build, Test, and Development Commands

Use Taskfile for local workflows:

- `task` lists available tasks.
- `task setup` creates `.env` from `.env.example` and verifies `act` is installed.
- `task lint` runs `markdownlint . --ignore CHANGELOG.md --fix`.
- `task test:dry-run` lists the local `act` jobs without executing them.
- `task test:issue` runs the action against `.github/workflows/events/issue-opened.json`.
- `task test:comment` runs the action against `.github/workflows/events/issue-comment.json`.
- `task test:all` runs both local action scenarios.
- `task clean` removes temporary test output.

## Coding Style & Naming Conventions

YAML is the primary implementation format. Use two-space indentation, quoted strings only when they improve clarity
or are required by GitHub Actions syntax, and descriptive step names. Keep action inputs in kebab-case, matching
existing names such as `github-token`, `trigger-phrase`, and `max-turns`. Markdown follows `.markdownlint.json`:
line length is 120, selected inline HTML is allowed, and first-line heading enforcement is disabled.

## Testing Guidelines

There is no unit test suite; validation is done with `act` against the provided issue and issue-comment fixtures.
Run `task test:dry-run` after workflow shape changes and `task test:all` before opening a PR that changes
`action.yml` or `.github/workflows/infer.yml`. Update the JSON fixtures when changing trigger behavior, model
override parsing, or event-specific logic.

## Commit & Pull Request Guidelines

Git history follows Conventional Commits, for example `chore(deps): Add codex and bump infer CLI`,
`ci(deps): Bump claude-code-action`, and `chore(license): Update license to Apache 2.0`. Use a concise type and
optional scope: `fix(action): ...`, `docs(readme): ...`, or `ci(release): ...`. Pull requests should describe the
behavior change, list local validation commands run, link related issues, and include screenshots only when changing
visible assets or README-rendered content.

## Security & Configuration Tips

Do not commit `.env` or real API keys. Add new provider secrets consistently across `action.yml`, README examples,
`.env.example`, and workflows. Prefer GitHub App tokens for workflows that need write access.

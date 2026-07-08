# Repository Guidelines

## Project Structure & Module Organization

This repository ships the Infer Agent GitHub Action. `action.yml` defines the composite action interface and the
orchestration steps. TypeScript runtime code lives in `src/`, with prompts in `src/prompts/*.md`; generated prompt code
is rebuilt by `bun run build:prompts`. Bundled action entrypoints are committed under `dist/`, and bundling is handled by
`scripts/bundle.mjs`. Unit tests live in `__tests__/`, including mock-agent fixtures in `__tests__/fixtures/`. Local
workflow examples are in `examples/local/`, event payload fixtures are under `.github/workflows/events/`, and public
assets such as `assets/spinner.svg` live in `assets/`. Treat `.infer/` and `.env` as local state only.

## Build, Test, and Development Commands

- `bun install --frozen-lockfile` installs dependencies from `bun.lock`.
- `bun run build:prompts` regenerates prompt TypeScript from `src/prompts/*.md`.
- `bun run test` runs the Bun unit test suite after rebuilding prompts.
- `bun run lint` rebuilds prompts and runs ESLint.
- `bun run typecheck` runs `tsc --noEmit`.
- `bun run package` rebuilds prompts and bundles `src/` into `dist/`.
- `bun run all` formats, lints, typechecks, tests, and packages the action.
- `task test:issue`, `task test:comment`, and `task test:direct` run local `act` dry-run scenarios.
- `task test:mock` runs the bundled runner against `__tests__/fixtures/mock-agent.mjs`.

## Coding Style & Naming Conventions

Use TypeScript ES modules and Bun-native test APIs. Prefer descriptive kebab-case for action inputs and YAML fields
such as `github-token`, `max-turns`, and `enable-git-operations`. Keep YAML indentation at two spaces. Use Prettier for
formatting and ESLint for code quality; `@typescript-eslint/consistent-type-imports` and unused-variable checks are
enforced. Prefix intentionally unused variables or parameters with `_`.

## Testing Guidelines

Add focused tests in `__tests__/` with `*.test.ts` filenames. Cover trigger handling, prompt generation, GitHub API
dry-run behavior, recovery paths, redaction, and git-operation controls when those areas change. Run `bun run test` for
unit coverage, then use the relevant `task test:*` scenario when action wiring, event parsing, or workflow behavior
changes.

## Commit & Pull Request Guidelines

Use Conventional Commits, matching recent history such as `feat: export run telemetry`, `fix(prompts): ...`, and
`chore(deps): ...`. Pull requests should explain the behavior change, list validation commands run, and link related
issues. Include screenshots only for visible documentation or asset changes.

## Pre-Push Workflow

Before pushing always run `task generate` and `task package`.

## Security & Configuration Tips

Never commit `.env`, API keys, or real tokens. Be conservative when changing command allowlists, token handling,
redaction, or `enable-git-operations`; these settings affect what the action can execute in consumer repositories.

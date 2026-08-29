# Repository Guidelines

## What this is

A GitHub composite Action (`action.yml`) with a TypeScript hot path. The shipped surface is `action.yml` plus pre-bundled ESM entrypoints under `dist/runner/`, `dist/salvage/`, and `dist/report/` (committed to git, built from `src/*.ts` with `bun build`). Simple steps (trigger detection, cooking comment, CLI install, git config, cleanup) are `shell: bash`; the three complex steps (run agent, salvage unpushed work, report result) are `bun` invocations of the bundled scripts.

## Environment

Run everything inside the flox environment — `bun`, `task`, and `node` are **not** on the bare `PATH`. Either `flox activate` (its hook runs `bun install --frozen-lockfile`) or prefix one-off commands with `flox activate --` (e.g. `flox activate -- bun run test`). CI does not use flox; it installs Bun via `oven-sh/setup-bun` at the same pin.

## Build, Test, and Development Commands

- `bun install --frozen-lockfile` — install from `bun.lock`.
- `bun run build:prompts` — regenerate prompt TypeScript from `src/prompts/*.md`.
- `bun run test` — Bun unit tests (rebuilds prompts first). Single file: `bun test __tests__/failures.test.ts`.
- `bun run lint` — ESLint (rebuilds prompts first). `bun run lint:md` — markdownlint (check-only).
- `bun run typecheck` — `tsc --noEmit`.
- `bun run package` — rebuild prompts and bundle `src/` into `dist/`.
- `bun run all` — format + lint + typecheck + test + package.
- `task test:issue` / `test:comment` / `test:direct` / `test:review` — local `act` dry-run scenarios (no token/`.env` needed).
- `task test:mock SCENARIO=happy` — run the bundled runner against `__tests__/fixtures/mock-agent.mjs`.
- `task precommit:install` — point git at `.githooks/pre-commit` (`core.hooksPath`); `task precommit:run` runs the same checks manually.

## Coding Style & Conventions

TypeScript ES modules, Bun-native test APIs. Kebab-case for action inputs and YAML fields (`github-token`, `enable-git-operations`). Two-space YAML indentation. Prettier + ESLint; `@typescript-eslint/consistent-type-imports` and unused-variable checks are enforced — prefix intentionally unused params with `_`. `tsconfig.json` is strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`); ESM only, so relative imports use `.js` extensions even for `.ts` source.

## Non-obvious gotchas

- **`dist/` is committed.** Consumers never run an install step. CI runs `git diff --exit-code dist/` after a fresh build — if you edit `src/`, run `bun run package` and commit the diff in the same PR.
- **Provider wiring is generated.** `scripts/gen-providers.mjs` (`task generate`) rewrites the `# BEGIN/END generated: provider-*` regions in `action.yml` and `src/redact.ts` from the schemas `Provider` enum. Don't hand-edit those regions; change the spec and re-run `task generate`.
- **`bun run` has no npm-style `pre<script>` hooks**, so the `build:prompts` prerequisite is chained explicitly inside `package`/`test`/`typecheck`/`lint`.

## Testing Guidelines

Add focused tests in `__tests__/` with `*.test.ts` filenames. Cover trigger handling, prompt generation, GitHub API dry-run behavior, recovery paths, redaction, and git-operation controls when those areas change. Use `task test:*` scenarios when action wiring, event parsing, or workflow behavior changes.

## Commit & PR Guidelines

Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:` — see `.releaserc.yaml`). PRs should explain the behavior change, list validation commands run, and link related issues. Before pushing run `task format`, `task generate`, and `task package`.

## Security

Never commit `.env`, API keys, or real tokens. Be conservative when changing command allowlists, token handling, redaction, or `enable-git-operations` — these affect what the action can execute in consumer repositories.

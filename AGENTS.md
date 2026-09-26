# AGENTS.md

## What this is

A GitHub composite Action (`action.yml`) with a TypeScript hot path. Consumers reference it as `inference-gateway/infer-action@<ref>`; when an issue, comment, PR review comment, or submitted review contains the trigger phrase (`@infer` by default) the action installs the `infer` CLI, runs the agent, and reports back. The shipped surface is `action.yml` plus pre-bundled ESM entrypoints under `dist/runner/`, `dist/salvage/`, and `dist/report/` (committed, built from `src/*.ts` with `bun build`). Simple steps (trigger detection, reactions, cooking comment, CLI install, git config, cleanup) are `shell: bash`; the three complex steps (`run-agent`, `salvage`, `report`) are `bun` invocations of the bundled scripts.

## Environment

Run everything inside the flox environment - `bun`, `task`, and `node` are **not** on the bare `PATH`. Either `flox activate` (its hook runs `bun install --frozen-lockfile`) or prefix one-off commands with `flox activate --` (e.g. `flox activate -- bun run test`). CI does not use flox; it installs Bun via `oven-sh/setup-bun`. Bun is pinned to the same version in both (`.flox/env/manifest.toml` and `.github/workflows/ci.yml`); `dist/` is byte-stable per Bun version, so a Bun bump regenerates `dist/` and must be committed.

## Build, Test, and Development Commands

- `bun install --frozen-lockfile` - install from `bun.lock`.
- `bun run build:prompts` - regenerate `src/prompts.gen.ts` from `src/prompts/*.md` (gitignored).
- `bun run format:check` / `format:write` - Prettier check/auto-format; CI runs the check.
- `bun run test` - Bun unit tests (rebuilds prompts first). Single file: `bun test __tests__/failures.test.ts`; single test: `bun test -t "<name>"`.
- `bun run lint` - ESLint (rebuilds prompts first). `bun run lint:md` - markdownlint (check-only; `task lint` is the auto-fixing variant).
- `bun run typecheck` - `tsc --noEmit`.
- `bun run package` - rebuild prompts and bundle `src/` into `dist/`.
- `bun run all` - format + lint + typecheck + test + package.
- `task build` - frozen install + package. `task generate` - regenerate provider wiring (see below) then package.
- `task test:issue` / `test:comment` / `test:direct` / `test:review` / `test:all` - `act` dry-run of the working-tree action (`uses: ./`) against `examples/local/*.yml`. Need Docker + `act` only; pass `-s GITHUB_TOKEN=$(gh auth token)` to resolve real reads. `task test:list` lists jobs; `task setup` checks prerequisites.
- `task test:mock SCENARIO=happy` - run the bundled runner against `__tests__/fixtures/mock-agent.mjs`. Scenarios: `happy`, `failures`, `no-todos`, `empty`, `incomplete`, `no-git`, `commit-no-push`, `hang`.
- `task precommit:install` - point git at `.githooks/pre-commit`; `task precommit:run` runs the same checks manually.
- `task clean` - remove `/tmp/agent-output.txt`.

CI (`.github/workflows/ci.yml`) runs format-check, eslint, markdownlint, typecheck, test, package, `git diff --exit-code dist/`, a provider-wiring drift check, a CLI env-name contract test, and a mock smoke test.

## Coding Style & Conventions

TypeScript ES modules, Bun-native test APIs. Kebab-case for action inputs and YAML fields (`github-token`, `enable-git-operations`). Two-space YAML indentation. Prettier + ESLint; `@typescript-eslint/consistent-type-imports` and unused-variable checks are enforced - prefix intentionally unused params with `_`. `tsconfig.json` is strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noPropertyAccessFromIndexSignature`); ESM only, so relative imports use `.js` extensions even for `.ts` source (e.g. `from './ticker.js'`). Don't add new top-level files lightly - new behavior usually belongs in `action.yml` (a new input + a step).

### Code Readability

- Write self-explanatory code: clear names and small, single-purpose functions carry the intent.
  If a block needs a comment to be understood, extract it into a well-named function or variable.
- No inline comments inside function bodies.
- Doc comments on functions, types, and modules are at most 5 lines: what it does and why, not how.
- Tool directives are not comments and stay where the tool needs them (lint suppressions, build
  tags, compiler pragmas, code generation markers).

## Bun runtime

Bun is the package manager, bundler, test runner, and runtime - no Node in the build/test/runtime path. The only Node is the manually-dispatched `Release` workflow (`semantic-release` on `actions/setup-node`), kept on Node deliberately.

- It is a *composite* action, so the TS steps are `shell: bash` steps calling `bun "$GITHUB_ACTION_PATH/dist/<name>/index.js"`; `action.yml` installs Bun via `oven-sh/setup-bun` (pinned).
- `scripts/bundle.mjs` bundles with `bun build --target=bun` and rewrites the shebang. There are no production dependencies; if one is ever added, ship a `licenses.txt` next to each bundle.
- Entrypoints run `main()` only when `import.meta.main` is true, which is how tests import them without firing `main()`.
- `bun test` has no `vi.stubEnv`; tests save/restore `process.env` by hand.
- `bun run` has no npm-style `pre<script>` hooks, so `build:prompts` is chained explicitly inside `package`/`test`/`typecheck`/`lint`.
- `bunfig.toml` sets `[run] bun = true` so node-shebanged dev CLIs (prettier/eslint/tsc/markdownlint) run under Bun.

## Pipeline invariants

- **`check-trigger`** gates every later step (`triggered=true/false`). Trigger matching is whole-word (`@infer` never matches `@inference`); bot-authored comments are skipped (recursion guard); `/model provider/name` in the comment sets a model override. A PR review-comment trigger enables **focused review mode** (`src/context.ts`): the PR conversation is not fetched and the task uses the `task-pr-review.md` template. Conversation triggers render only the last 3 human comments.
- **One bot comment per run.** The cooking comment is posted once (stale "I'm cooking" comments are deleted first) and everything downstream PATCHes it. Sentinels `<!-- infer:plan-end -->` and `<!-- infer:result-start -->` split it into plan / middle (PR link) / result (footer) zones; each writer only replaces its own zone via `GithubClient.updateZone()`. The runner ticker owns the plan zone; `report.ts` owns the middle and result zones.
- **CLI config is via env vars, not project config.** The action seeds only the userspace `~/.infer/config.yaml` (`infer init`, idempotent) and sets tool approval / WebFetch domains through `INFER_TOOLS_*` env vars on the run-agent step. The "Hide Infer workspace from git" step keeps CLI writes under `.infer/` out of commits and the dirty-tree check (`.git/info/exclude` + `git update-index --skip-worktree`).
- **`run-agent`** (`src/runner.ts`) is invoked with `exec bun ...` so bun is the step's top-level process and receives `SIGINT`/`SIGTERM` on a job-timeout cancel (bash would swallow it). It passes the system prompt via `INFER_PROMPTS_AGENT_SYSTEM_PROMPT` (+ `..._CLAUDE_CODE` for subscription mode), pins `INFER_AGENT_SYSTEM_PROMPT_WITH_DEFAULTS=true`, and passes reminders via `INFER_REMINDERS_CONFIG` (`src/reminders.ts`, `merge: true`). A CI contract-test job guards these env names against upstream renames. Prompt overrides come from `INFER_PROMPT_OVERRIDE_*`. It spawns `infer agent` (or `$INFER_BIN`), tees stdout to `/tmp/agent-output.txt`, and a ticker mirrors `TodoWrite` to the plan zone and persists todos to `/tmp/infer-todos.json`. It does **not** salvage or link PRs. On a signal it writes the cancel marker `/tmp/infer-cancelled`, kills the child, and exits without setting `exit-code`.
- **Ticker throttle is throttle-latest** (`throttleLatest` in `src/ticker.ts`): the first call starts a 1.5 s timer, later calls update the pending value without resetting it, and the timer fires once with the latest value.
- **`salvage`** (`src/salvage.ts` -> `recoverUnpushedWork` in `src/recovery.ts`) runs on `always()` when git ops are on (and not in review mode) - including graceful exit-0 runs that left unpushed work. It commits/pushes leftover work to a `fix/issue-N` / `feature/auto-<run-id>` branch (or the agent's branch / PR head) and opens a draft PR titled `... (salvaged)`. Duplicate-PR guards (issue #130): an any-state PR lookup (open > merged > closed blocks creation; a lookup failure pushes but never creates) and a tree-identity check against `origin/<base>`. Fail-soft; never merges; never pushes `main`/`master`; skips fork PRs; git/`gh` calls use a 60 s timeout and `GIT_TERMINAL_PROMPT=0`.
- **`report`** (`src/report.ts`) runs on `always()`. It emits status outputs **first** (`finalizeStatus`) so a later throw can't leave status empty. Cancel marker => timed out, exit-code normalised to 0, rendered "Stopped early" (never "Failed"). Empty exit-code *without* the marker => "Failed" (runner crash or skipped step), never laundered into a timeout. "Stopped early" is also shown for non-completed todos, dirty tree or unpushed commits, or a salvaged PR. It then links the salvaged or agent-opened PR (backfilling a thin PR body from the commit log, `src/pr-body.ts`) and PATCHes the footer (failed tool calls with empty messages dropped, final response redacted and capped, token usage and cost) into the result zone, falling back to POST, and writes `$GITHUB_STEP_SUMMARY`.
- **The timeout-recovery path** (signal -> cancel marker -> child kill -> `always()` salvage + report) is the highest-risk surface; treat changes to runner, salvage, or report with care.

## Agent permissions (bash allow-list)

The CLI owns the read-only bash baseline; the action only appends writes via `INFER_TOOLS_BASH_ALLOW_APPEND` (`composeBashAllowAppend` / `GIT_WRITE_ALLOW` in `src/bash-allow.ts`) plus the `bash-allow-append` input. `GIT_WRITE_ALLOW` covers git add/commit/push/checkout/switch/fetch/restore/reset/stash, `gh pr create`, `gh pr ready`, and `gh pr edit` scoped to `--title`/`--body`/`--body-file`. `gh pr merge`/`close`/`review` are never appended - the agent opens and readies a draft PR but never merges. Entries are Go regexes anchored to the whole command (write `npm( .*)?`, not `npm`); the CLI splits on `,` and `\n`. There is no env-var path to replace the baseline. `enable-git-operations: false` drops `GIT_WRITE_ALLOW`, skips salvage, and skips PR linking.

## Observability and dry-run

- `debug` -> `INFER_LOGGING_DEBUG`: surfaces compaction and reminder-injection events to the Actions log independent of `mirror-agent-logs`, and enables a fail-soft configuration-summary step (credential presence only, never values).
- `compact-auto-at` -> `INFER_COMPACT_AUTO_AT` (percent of context window, 20-100, default 50).
- OpenTelemetry is CLI-driven; the action passes `OTEL_*` inputs through to the CLI subprocess. `otel-collector` (default `true`) runs a temporary collector container in `action.yml` only (no `src/` involvement); it writes `INFER_TELEMETRY_*` (not `OTEL_EXPORTER_OTLP_ENDPOINT`, which the run-agent `env:` block would overwrite). Warn-and-continue on failure; skipped under dry-run.
- `dry-run: true` (+ optional `mock-agent-scenario`) is the only mock-agent path: it points `INFER_BIN` at the mock agent, skips install/init/skills, prints the resolved prompts, and simulates every GitHub mutation (`[dry-run] would ...`) while keeping reads real. The cooking step emits a synthetic comment id `999999999`. The `happy` scenario commits without pushing, so salvage logs `[dry-run] [recover] would recover work ...` and the report renders "Stopped early" - expected.

## Non-obvious gotchas

- **`dist/` is committed.** Consumers never run an install step. CI runs `git diff --exit-code dist/` after a fresh build - if you edit `src/`, run `bun run package` and commit the diff in the same PR.
- **Provider wiring is generated.** `scripts/gen-providers.mjs` (`task generate`) rewrites the `# BEGIN/END generated: provider-*` regions in `action.yml` and `src/redact.ts`, plus the provider rows in the README inputs table, from the schemas `Provider` enum at the pinned `SCHEMAS_REF` (override with `SCHEMAS_REF=...` or `INFER_SCHEMAS_OPENAPI=<path>`). Don't hand-edit those regions; change the spec and re-run `task generate` - CI fails the PR if the wiring drifts.
- **The pinned CLI version** is `inputs.version` in `action.yml`; bump it via a `chore(deps)` commit.
- **`INFER_BIN`** overrides the `infer` binary path (tests and dry-run use the mock agent).
- **`.infer/`** holds this repo's own maintainer-agent workspace: `.infer/*.yaml` is tracked; runtime state is ignored via `.infer/.gitignore`.

## Testing Guidelines

Add focused tests in `__tests__/` with `*.test.ts` filenames. Cover trigger handling, prompt generation, GitHub API dry-run behavior, recovery paths, redaction, and git-operation controls when those areas change. Use `task test:*` scenarios when action wiring, event parsing, or workflow behavior changes.

## Commit & PR Guidelines

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `refactor:` - see `.releaserc.yaml`; `feat` -> minor, `fix`/`docs`/`chore` -> patch, breaking -> major). Releases run via the manually-dispatched `Release` workflow (`semantic-release`). PRs should explain the behavior change, list validation commands run, and link related issues. Before pushing run `task format`, `task generate`, and `task package`.

## Security

Never commit `.env`, API keys, or real tokens. Be conservative when changing command allowlists, token handling, redaction, or `enable-git-operations` - these affect what the action can execute in consumer repositories.

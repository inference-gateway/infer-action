# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This repo is a **GitHub composite Action** with a **TypeScript hot path**. The shipped surface is `action.yml` plus the pre-bundled ESM entrypoints under `dist/runner/` and `dist/post-results/` (committed to git, built from `src/*.ts` with `@vercel/ncc`). The "simple" steps (trigger detection, eyes reaction, cooking-comment post, CLI install, git config, cleanup) are still `shell: bash`. The two complex steps — running the agent with a parallel ticker that mirrors `TodoWrite` to the issue comment, and posting the final result — are `node` invocations of the bundled scripts.

Consumers reference it as `inference-gateway/infer-action@<ref>` from their workflows. When a GitHub issue or comment containing the trigger phrase (`@infer` by default) fires, the action installs the `infer` CLI, sets up Node 22, then runs `node dist/runner/index.js` (which spawns `infer agent`, observes its JSON-line stream, debounces TodoWrite updates to the cooking comment, and links the PR the agent opened on its feature branch) and finally `node dist/post-results/index.js` (which builds a structured result footer — including token usage — and PATCHes it into the same cooking comment).

## Common commands

The TypeScript hot path uses npm (no pnpm/yarn). `task` wraps the most common combinations.

```sh
npm ci                  # install (frozen lockfile)
npm run package         # ncc-bundle src/runner.ts + src/post-results.ts -> dist/
npm test                # vitest run
npm run typecheck       # tsc --noEmit
npm run lint            # eslint .
npm run format:check    # prettier --check .
npm run format:write    # prettier --write .
npm run all             # format + lint + test + typecheck + package
```

`task` targets:

- `task build` — `npm ci && npm run package`
- `task test:unit` — `npm test`
- `task test:mock SCENARIO=happy` — runs the runner end-to-end against the mock agent (`__tests__/fixtures/mock-agent.mjs`). Useful for local iteration without a real `infer` CLI or GitHub token. Mock scenarios: `happy`, `failures`, `no-todos`, `empty`.
- `task setup` / `task test:issue` / `task test:comment` / `task test:all` — `act`-based local tests of the full composite action (require `.env` and Docker).
- `task lint` — `markdownlint` (note: separate from `npm run lint` which is eslint over `src/`)
- `task clean` — removes `/tmp/agent-output.txt`

Run a single vitest file: `npx vitest run __tests__/failures.test.ts`
Run a single test by name: `npx vitest run -t "drops envelope failures with an empty message"`

CI (`.github/workflows/ci.yml`) runs format-check → lint → typecheck → test → package → `git diff --exit-code dist/` → mock smoke-test on every PR. The diff check fails if a contributor edited `src/` without rebuilding `dist/`.

Dogfood against a real issue: set `use-mock-agent: true` (and optionally `mock-agent-scenario: happy|failures|no-todos|empty`) on a normal action invocation. The action skips the CLI install/init/skills steps and points `INFER_BIN` at the bundled `__tests__/fixtures/mock-agent.mjs` instead. Useful for eyeballing comment shape, token-usage footer, and PR-link behavior of a build before cutting a release, without burning provider tokens.

Releases run via the manually-dispatched `Release` workflow (`.github/workflows/release.yml`), which invokes `semantic-release`. Versions are derived from conventional commit messages per `.releaserc.yaml`.

## Architecture: what `action.yml` actually does

The composite action is one linear pipeline. The bash steps are unchanged from earlier versions; the two `node` steps are where the new TypeScript hot path lives.

1. **`check-trigger`** — scans `github.event.issue.{title,body}` or `github.event.comment.body` for the trigger phrase; skips if a bot authored the comment (recursion guard); extracts an optional `/model provider/name` override into `model_override`. Sets `triggered=true/false` — every later step is gated on this.
2. **Eyes reaction** + **cooking comment** — posts an "I'm cooking..." comment and captures its ID into `cooking_comment_id`. This is the single bot comment per run; everything downstream PATCHes it in place. Before posting, deletes any prior "I'm cooking" comments on the same issue (cleanup for runs that died mid-execution).
3. **Install + init Infer CLI** — `curl | bash` from the `inference-gateway/cli` repo at the pinned `version` input.
4. **Configure Git** as `github-actions[bot]`.
5. **Setup Node.js 22** via `actions/setup-node@v6` — required for the runner and post-results bundles.
6. **`run-agent`** (TS, `dist/runner/index.js`) — the core step. Spawns `infer agent -m $INFER_AGENT_MODEL "$TASK"` (or `$INFER_BIN` if set — used by tests and by `use-mock-agent: true`), tees stdout to `/tmp/agent-output.txt`, mirrors to the GitHub Actions log, and runs a **parallel ticker** over the JSON-line stream. The ticker dispatches to per-tool handlers; the only one registered for MVP is `TodoWrite`, which renders the agent's todos as a markdown checklist and **throttles** PATCHes to the cooking comment's plan zone (max one PATCH per ~1.5 s, latest value wins). After the child exits the runner flushes the ticker, then runs **PR-link**: the **agent** opens its own PR with `gh pr create` (the system prompt instructs it to, with a real description) while the agent is still running; on exit the runner looks up the open PR for the current branch via `pulls.list` and appends its URL to the comment's middle zone. The runner does **not** create, push, or merge PRs — if the agent opened none, there is nothing to link. The bash whitelist allows `gh pr create` but deliberately withholds `gh pr merge`/`close`/`edit`/`review`.
7. **`post-results`** (TS, `dist/post-results/index.js`, runs on `always()`) — extracts failed tool calls from `/tmp/agent-output.txt` using a two-pass scan: pass 1 builds a `tool_call_id → tool_name` map from every `assistant.tool_calls[]` message; pass 2 emits one row per failure, looking the name up via the map (so envelope failures get a real tool name instead of `(unknown tool)`) and **dropping any row whose error message is empty** (which fixed the "blank `(unknown tool):` rows" bug). Builds the status footer (icon, model, exit code, workflow link, **token usage** summed from `token_usage` on assistant messages via `extractUsage` in `src/usage.ts`, failures `<details>`, agent-output tail truncated to 40,000 chars), writes it to `$GITHUB_STEP_SUMMARY`, then PATCHes it into the cooking comment's result zone. Falls back to `POST` a new comment only if the PATCH fails or `cooking_comment_id` is empty.
8. **Cleanup** — removes the temp files.

Key cross-cutting concepts to keep coherent when editing:

- **Section sentinels in the cooking comment body** — `<!-- infer:plan-end -->` and `<!-- infer:result-start -->` split the body into three zones: plan (above plan-end), middle (between sentinels, used for the PR URL), result (below result-start, used for the final footer). Each writer (`runner.ts` ticker, `runner.ts` PR-link, `post-results.ts`) only ever replaces its own zone via `GithubClient.updateZone()`. This is what lets three independent writers update the same comment without stomping each other. See `splitZones` / `joinZones` in `src/github.ts`.
- **Ticker debounce semantics** are throttle-latest: first call sets a 1.5 s timer, subsequent calls update the pending value but don't reset the timer, the timer fires once with the latest value, and a new burst starts the next timer. Tuned so a tight loop of TodoWrites coalesces into ≤ one PATCH per ~1.5 s while still surfacing the freshest state. See `throttleLatest` in `src/ticker.ts`.
- **The bash whitelist is override + append over a safe base.** The built-in base is `git` (commands) plus `^git .*` and read-only `gh` **including `gh pr create`** (patterns), built in `runner.ts` (`DEFAULT_WHITELIST_COMMANDS` / `DEFAULT_WHITELIST_PATTERNS`). `bash-whitelist-commands`/`-patterns` **replace** the base; `bash-whitelist-commands-append`/`-patterns-append` **add** to it. Effective = `(override ?? base) + append`. `gh pr merge`/`close`/`edit`/`review` are intentionally absent so the agent can open but never merge a PR. Each pattern is a standalone regex (no commas inside — the CLI splits the list on `,`).
- **`enable-git-operations: false`** disables PR linking in the runner *and* withholds the `git`/`gh` base from the whitelist (append still applies), so the agent cannot push or open PRs by hand.
- **The runner owns the comment; the agent owns the branch and the PR.** The system prompt does not ask the agent to comment on the issue (the runner mirrors TodoWrite and posts the result), but it *does* tell the agent to commit on a `fix/issue-N` branch, run the repo's checks before each commit, and open the PR itself with `gh pr create` and a real description — never merging it. `custom-instructions` is still appended verbatim.
- **The `infer` binary path is overridable via `INFER_BIN`** — the integration test workflow and the local `task test:mock` target use this to substitute `__tests__/fixtures/mock-agent.mjs` for the real CLI.
- **Trigger-phrase matching is a substring check, not a regex** (`[[ "$ISSUE_BODY" == *"$TRIGGER_PHRASE"* ]]`). The `/model` override is parsed with a bash regex (`/model[[:space:]]+([a-zA-Z0-9/_.:-]+)`).
- **Observability knobs** wired to the Infer CLI's viper config:
  - `inputs.debug` → `INFER_LOGGING_DEBUG`. Flips the CLI's zap logger to DebugLevel, which gates a small set of stdout JSON-line events (`role: "user", hidden: true, kind: "system_reminder"` for reminder injections; `type: "compaction_started" | "compaction_completed"` for auto-compaction). Hidden by default; turn on when diagnosing why the agent didn't follow the prompt or whether reminders fired.
  - `inputs.compact-auto-at` → `INFER_COMPACT_AUTO_AT`. Auto-compaction threshold as a percent of model context window (default 80, valid 20-100). Lower to compact earlier; raise to delay summarisation.

## Scripts directory (`src/` and `dist/`)

```
src/
├── types.ts        Envelope + Todo shapes, JSON-content parsers
├── parser.ts       async generator over JSON-line streams
├── ticker.ts       Per-tool handler registry + throttleLatest debounce helper
├── github.ts       Octokit wrapper + 3-zone splitZones/joinZones/updateZone
├── failures.ts     Two-pass extract (id->name map + render)
├── runner.ts       run-agent entrypoint
└── post-results.ts post-results entrypoint
```

`tsconfig.json` is strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noPropertyAccessFromIndexSignature`. ESM only (`module: "nodenext"`), so all relative imports must use `.js` extensions even when importing `.ts` source (e.g. `from './ticker.js'`). `import type` is enforced via the `@typescript-eslint/consistent-type-imports` rule.

`dist/` is **built by ncc and committed to the repo** — consumers don't run `npm install`. CI verifies `git diff --exit-code dist/` after a fresh build. If you edit `src/`, run `npm run package` and commit the diff in the same PR.

`__tests__/` uses vitest. `__tests__/fixtures/mock-agent.mjs` is a standalone Node script that mimics the `infer agent` JSON-line stream for the chosen `MOCK_SCENARIO` — point `INFER_BIN` at it to drive the runner without the real CLI.

## Conventions

- **Commits must follow Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:` — see `.releaserc.yaml` for the release-impact mapping). `feat` → minor, `fix`/`docs`/`chore` → patch, breaking → major.
- **The pinned CLI version** lives in `action.yml` at `inputs.version.default` (currently `v0.114.0`). Bump it via a `chore(deps)` commit.
- **Don't add new top-level files lightly** — this is a single-purpose action. New behavior almost always belongs inside `action.yml` (a new input + a step) rather than a new script or directory.
- **`.infer/` is local agent state** (config, conversations, logs from running `infer` locally) and is gitignored — not part of the shipped action.

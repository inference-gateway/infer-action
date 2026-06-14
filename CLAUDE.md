# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This repo is a **GitHub composite Action** with a **TypeScript hot path**. The shipped surface is `action.yml` plus the pre-bundled ESM entrypoints under `dist/runner/` and `dist/post-results/` (committed to git, built from `src/*.ts` with `@vercel/ncc`). The "simple" steps (trigger detection, eyes reaction, cooking-comment post, CLI install, git config, cleanup) are still `shell: bash`. The two complex steps — running the agent with a parallel ticker that mirrors `TodoWrite` to the issue comment, and posting the final result — are `node` invocations of the bundled scripts.

Consumers reference it as `inference-gateway/infer-action@<ref>` from their workflows. When a GitHub issue or comment containing the trigger phrase (`@infer` by default) fires, the action installs the `infer` CLI, sets up Node 22, then runs `node dist/runner/index.js` (which spawns `infer agent`, observes its JSON-line stream, debounces TodoWrite updates to the cooking comment, and links the PR the agent opened on its feature branch) and finally `node dist/post-results/index.js` (which builds a structured result footer — including token usage and per-session cost — and PATCHes it into the same cooking comment).

## Common commands

The TypeScript hot path uses npm (no pnpm/yarn). `task` wraps the most common combinations.

```sh
npm ci                  # install (frozen lockfile)
npm run package         # ncc-bundle src/runner.ts + src/post-results.ts -> dist/
npm test                # vitest run
npm run typecheck       # tsc --noEmit
npm run lint            # eslint .
npm run lint:md         # markdownlint . (check-only; no --fix)
npm run format:check    # prettier --check .
npm run format:write    # prettier --write .
npm run all             # format + lint + test + typecheck + package
```

`task` targets:

- `task build` — `npm ci && npm run package`
- `task test:unit` — `npm test`
- `task test:mock SCENARIO=happy` — runs the runner end-to-end against the mock agent (`__tests__/fixtures/mock-agent.mjs`). Useful for local iteration without a real `infer` CLI or GitHub token. Mock scenarios: `happy`, `failures`, `no-todos`, `empty`.
- `task test:issue` / `task test:comment` / `task test:direct` / `task test:all` — `act`-based local tests that run the **working-tree** action (`uses: ./`) in `dry-run` mode against `examples/local/*.yml`. Require Docker + `act` only — no `.env`/token (dry-run simulates all mutations; reads fail-soft). Pass a token with `-s GITHUB_TOKEN=$(gh auth token)` to resolve real reads. `task test:list` lists jobs without executing; `task setup` checks `act`/Docker and seeds `.env`.
- `task lint` — `markdownlint --fix` (the auto-fixing local convenience; `npm run lint:md` is the same lint check-only, and is what CI runs. Both are separate from `npm run lint`, which is eslint over `src/`)
- `task clean` — removes `/tmp/agent-output.txt`

Run a single vitest file: `npx vitest run __tests__/failures.test.ts`
Run a single test by name: `npx vitest run -t "drops envelope failures with an empty message"`

CI (`.github/workflows/ci.yml`) runs format-check → lint (eslint) → lint:md (markdownlint) → typecheck → test → package → `git diff --exit-code dist/` → mock smoke-test on every PR. The diff check fails if a contributor edited `src/` without rebuilding `dist/`.

Dry-run a build locally: set `dry-run: true` (and optionally `mock-agent-scenario: happy|failures|no-todos|empty`) on an action invocation. The action skips the CLI install/init/skills steps, points `INFER_BIN` at the bundled `__tests__/fixtures/mock-agent.mjs`, prints the resolved SYSTEM/TASK/REMINDER prompts, and **simulates** every GitHub mutation (`[dry-run] would …`) while keeping reads real. Useful for eyeballing comment shape, the token-usage footer, and PR-link behavior of a build before cutting a release — without burning provider tokens or mutating anything. (`dry-run` is the only mock-agent path; the old `use-mock-agent` input was removed in favor of it.)

Releases run via the manually-dispatched `Release` workflow (`.github/workflows/release.yml`), which invokes `semantic-release`. Versions are derived from conventional commit messages per `.releaserc.yaml`.

## Architecture: what `action.yml` actually does

The composite action is one linear pipeline. The bash steps are unchanged from earlier versions; the two `node` steps are where the new TypeScript hot path lives.

1. **`check-trigger`** — scans `github.event.issue.{title,body}` or `github.event.comment.body` for the trigger phrase; skips if a bot authored the comment (recursion guard); extracts an optional `/model provider/name` override into `model_override`. Sets `triggered=true/false` — every later step is gated on this.
2. **Eyes reaction** + **cooking comment** — posts an "I'm cooking..." comment and captures its ID into `cooking_comment_id`. This is the single bot comment per run; everything downstream PATCHes it in place. Before posting, deletes any prior "I'm cooking" comments on the same issue (cleanup for runs that died mid-execution).
3. **Install + init Infer CLI** — `curl | bash` from the `inference-gateway/cli` repo at the pinned `version` input, then **Configure Infer for headless run** — `infer config set` to auto-approve the `Write`/`Edit`/`Delete` tools (v0.121.0 defaults them to require approval, which a headless run with no approval broker would otherwise block) and to set `tools.web_fetch.allowed_domains` from the `web-fetch-domains` input.
4. **Configure Git** as `github-actions[bot]`.
5. **Setup Node.js 22** via `actions/setup-node@v6` — required for the runner and post-results bundles.
6. **`run-agent`** (TS, `dist/runner/index.js`) — the core step. Spawns `infer agent -m $INFER_AGENT_MODEL "$TASK"` (or `$INFER_BIN` if set — used by tests and by `dry-run: true`), tees stdout to `/tmp/agent-output.txt`, mirrors to the GitHub Actions log, and runs a **parallel ticker** over the JSON-line stream. The ticker dispatches to per-tool handlers; the only one registered for MVP is `TodoWrite`, which renders the agent's todos as a markdown checklist and **throttles** PATCHes to the cooking comment's plan zone (max one PATCH per ~1.5 s, latest value wins). After the child exits the runner flushes the ticker, then runs **PR-link**: the **agent** opens its own PR with `gh pr create` (the system prompt instructs it to, with a real description) while the agent is still running; on exit the runner looks up the open PR for the current branch via `pulls.list` and appends its URL to the comment's middle zone, and — for issue/direct runs where the agent created the PR — **backfills** a `## Summary`/`## Changes` body synthesised from the commit log via `pulls.update` when the agent left a thin one (empty or a bare `Fixes #N`); see `isThinPrBody`/`buildPrBody` in `src/pr-body.ts`. The runner does **not** create, push, or merge PRs (it will rewrite a thin body, but never opens or merges one) — if the agent opened none, there is nothing to link. The action appends the agent's PR-workflow writes (`git add/commit/push/checkout/switch/fetch` + `gh pr create`) onto the CLI's read-only baseline via `INFER_TOOLS_BASH_ALLOW_APPEND`, deliberately withholding `gh pr merge`/`close`/`edit`/`review`.
7. **`post-results`** (TS, `dist/post-results/index.js`, runs on `always()`) — extracts failed tool calls from `/tmp/agent-output.txt` using a two-pass scan: pass 1 builds a `tool_call_id → tool_name` map from every `assistant.tool_calls[]` message; pass 2 emits one row per failure, looking the name up via the map (so envelope failures get a real tool name instead of `(unknown tool)`) and **dropping any row whose error message is empty** (which fixed the "blank `(unknown tool):` rows" bug). Builds the status footer (icon, model, exit code, workflow link, the **agent's final response** — the `content` of the last assistant message with non-empty text, extracted by `extractFinalResponse` in `src/response.ts` and rendered as a visible, non-collapsed section directly under the status header and above the metadata, redacted and capped at 16,000 chars (omitted entirely when the run produced no closing text) — **token usage** summed from `token_usage` on assistant messages and **per-session cost** read from the CLI's session-end `session_stats` line — both via `extractUsage` in `src/usage.ts`; the parser admits that `type`-keyed line specifically, and cost renders only when non-zero — failures `<details>`), writes it to `$GITHUB_STEP_SUMMARY`, then PATCHes it into the cooking comment's result zone. Falls back to `POST` a new comment only if the PATCH fails or `cooking_comment_id` is empty.
8. **Cleanup** — removes the temp files.

Key cross-cutting concepts to keep coherent when editing:

- **Section sentinels in the cooking comment body** — `<!-- infer:plan-end -->` and `<!-- infer:result-start -->` split the body into three zones: plan (above plan-end), middle (between sentinels, used for the PR URL), result (below result-start, used for the final footer). Each writer (`runner.ts` ticker, `runner.ts` PR-link, `post-results.ts`) only ever replaces its own zone via `GithubClient.updateZone()`. This is what lets three independent writers update the same comment without stomping each other. See `splitZones` / `joinZones` in `src/github.ts`.
- **Ticker debounce semantics** are throttle-latest: first call sets a 1.5 s timer, subsequent calls update the pending value but don't reset the timer, the timer fires once with the latest value, and a new burst starts the next timer. Tuned so a tight loop of TodoWrites coalesces into ≤ one PATCH per ~1.5 s while still surfacing the freshest state. See `throttleLatest` in `src/ticker.ts`.
- **The bash allow-list is "CLI baseline + a git-write append."** As of CLI v0.121.0 the CLI owns the read-only baseline (`tools.bash.mode.all.allow`: file reads, read-only git/gh, and `gh project list|view|item-list|field-list`), inherited by headless `standard` mode — the action no longer ships its own read-only defaults. It only composes a small append in `src/bash-allow.ts` (`composeBashAllowAppend` / `GIT_WRITE_ALLOW`): the PR-workflow writes (`git add/commit/push/checkout/switch/fetch` + `gh pr create`) when git ops are on, plus the `bash-allow-append` input, passed as the CLI's single append env var `INFER_TOOLS_BASH_ALLOW_APPEND`. `gh pr merge`/`close`/`edit`/`review` are never appended, so the agent can open but never merge a PR. Each entry is a Go regex anchored to the whole command (so `npm` matches only bare `npm`; write `npm( .*)?`); the CLI splits the list on `,` and `\n`. There is **no env-var path to replace the baseline** — to do that, configure the CLI's `.infer/config.yaml` directly.
- **`enable-git-operations: false`** disables PR linking in the runner *and* omits `GIT_WRITE_ALLOW` from the append, so the agent keeps only the CLI's read-only baseline (`bash-allow-append` still applies) and cannot push or open PRs by hand.
- **The runner owns the comment; the agent owns the branch and the PR.** The system prompt does not ask the agent to comment on the issue (the runner mirrors TodoWrite and posts the result), but it *does* tell the agent to commit on a `fix/issue-N` branch, run the repo's checks before each commit, and open the PR itself with `gh pr create --body-file` (writing the body to a file with the Write tool first, to avoid shell-quoting problems) and a real description — never merging it. If a weak model still leaves a thin body, the runner backfills one from the commit log (`src/pr-body.ts`). `custom-instructions` is still appended verbatim.
- **The `infer` binary path is overridable via `INFER_BIN`** — the integration test workflow and the local `task test:mock` target use this to substitute `__tests__/fixtures/mock-agent.mjs` for the real CLI.
- **Trigger-phrase matching is a whole-word check** using bash regex with word boundaries (`[[ "\$ISSUE_BODY" =~ (^|[^[:alnum:]_])\$TRIGGER_PHRASE([^[:alnum:]_]|$) ]]`). This prevents partial-word matches (e.g., `@infer` will not match `@inference`). The `/model` override is parsed with a bash regex (`/model[[:space:]]+([a-zA-Z0-9/_.:-]+)`).
- **Observability knobs** wired to the Infer CLI's viper config:
  - `inputs.debug` → `INFER_LOGGING_DEBUG`. Flips the CLI's zap logger to DebugLevel, which gates a small set of stdout JSON-line events (`role: "user", hidden: true, kind: "system_reminder"` for reminder injections; `type: "compaction_started" | "compaction_completed"` for auto-compaction). Hidden by default; turn on when diagnosing why the agent didn't follow the prompt or whether reminders fired.
  - `inputs.compact-auto-at` → `INFER_COMPACT_AUTO_AT`. Auto-compaction threshold as a percent of model context window (default 80, valid 20-100). Lower to compact earlier; raise to delay summarisation.
  - `inputs.dry-run` → `INFER_DRY_RUN` (threaded into **both** node steps). Plan-only mode for local `act` testing, and the **only** mock-agent path (the former `use-mock-agent` input was removed). When true it sets `INFER_BIN` to the bundled mock agent (and `MOCK_MAKE_COMMIT` on the happy scenario), and the install/init/skills steps gate on `inputs.dry-run != 'true'`. The runner prints a "DRY RUN — the agent would be invoked with:" banner (system/task/reminder prompts + the resolved bash allow-list append), and `GithubClient` *simulates* every mutation (`[dry-run] would …`, redactor still applied) while letting reads pass through (token optional; empty token ⇒ unauthenticated Octokit, reads fail-soft). The bash eyes/cooking steps branch on `$DRY_RUN`; the cooking step emits a synthetic `cooking_comment_id=999999999` so `updateZone`/`clearSpinner` still log (both short-circuit before any API call). Run via `task test:issue` / `test:comment` / `test:direct`, which drive `examples/local/*.yml` (`uses: ./`) through `act` — no `.env` needed.

## Scripts directory (`src/` and `dist/`)

```
src/
├── types.ts        Envelope + Todo shapes, JSON-content parsers
├── parser.ts       async generator over JSON-line streams
├── ticker.ts       Per-tool handler registry + throttleLatest debounce helper
├── github.ts       Octokit wrapper + 3-zone splitZones/joinZones/updateZone
├── failures.ts     Two-pass extract (id->name map + render)
├── response.ts     Final assistant-message text extractor
├── bash-allow.ts   GIT_WRITE_ALLOW + composeBashAllowAppend (-> INFER_TOOLS_BASH_ALLOW_APPEND)
├── runner.ts       run-agent entrypoint
└── post-results.ts post-results entrypoint
```

`tsconfig.json` is strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noPropertyAccessFromIndexSignature`. ESM only (`module: "nodenext"`), so all relative imports must use `.js` extensions even when importing `.ts` source (e.g. `from './ticker.js'`). `import type` is enforced via the `@typescript-eslint/consistent-type-imports` rule.

`dist/` is **built by ncc and committed to the repo** — consumers don't run `npm install`. CI verifies `git diff --exit-code dist/` after a fresh build. If you edit `src/`, run `npm run package` and commit the diff in the same PR.

`__tests__/` uses vitest. `__tests__/fixtures/mock-agent.mjs` is a standalone Node script that mimics the `infer agent` JSON-line stream for the chosen `MOCK_SCENARIO` — point `INFER_BIN` at it to drive the runner without the real CLI.

## Conventions

- **Commits must follow Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:` — see `.releaserc.yaml` for the release-impact mapping). `feat` → minor, `fix`/`docs`/`chore` → patch, breaking → major.
- **The pinned CLI version** lives in `action.yml` at `inputs.version.default` (currently `v0.121.0`). Bump it via a `chore(deps)` commit.
- **Don't add new top-level files lightly** — this is a single-purpose action. New behavior almost always belongs inside `action.yml` (a new input + a step) rather than a new script or directory.
- **`.infer/` is local agent state** (config, conversations, logs from running `infer` locally) and is gitignored — not part of the shipped action.

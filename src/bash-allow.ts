// Bash allow-list append wiring for the runner.
//
// The Infer CLI (v0.121.0+) owns the read-only bash baseline that every agent mode inherits
// (`tools.bash.mode.all.allow`): inspection (`echo/ls/pwd/tree/wc/sort/uniq/head/tail/find/
// sleep`), `mkdir` and `ln -s`, read-only git (`git status|branch|log|diff|remote|show`),
// read-only gh (`gh <noun> list|view|status|diff|checks`, `gh auth status`, `gh search …`,
// `gh api repos/<owner>/<repo>/contents/<path>`, `gh api user/repos`), `gh project list|view|
// item-list|field-list` (the "read projects" access) and `infer binaries status`. Build runners
// like `task`/`make` are not in it. Headless `infer headless` runs in standard mode, so it inherits
// exactly that baseline. The action therefore no longer ships its own read-only defaults - it
// only appends the *writes* its PR workflow needs, via the CLI's single append knob
// `INFER_TOOLS_BASH_ALLOW_APPEND`.
//
// Each entry is a Go regex; the CLI's matcher anchors it to the whole command, so an entry
// like `git commit( .*)?` matches `git commit` and `git commit -m "x"` but not `git commitx`.

// The writes the agent needs to branch, stage, commit, push, recover from a staging
// mistake (restore/reset/stash), open a draft PR, mark it ready (never merge), and retitle
// or redescribe it. `gh pr merge|close|review` are deliberately absent, and `gh pr edit` is
// scoped so its first flag must be `--title`/`--body`/`--body-file`: the agent maintains its
// own PR's metadata, a human reviews and merges it. GraphQL is limited to an anonymous query
// (the spec forbids a mutation beside it) and the one `resolveReviewThread` mutation, so the
// agent can resolve a review thread it addressed. No entry may contain a comma.
export const GIT_WRITE_ALLOW = [
  "git add( .*)?",
  "git commit( .*)?",
  "git push( .*)?",
  "git checkout( .*)?",
  "git switch( .*)?",
  "git fetch( .*)?",
  "git restore( .*)?",
  "git reset( .*)?",
  "git stash( .*)?",
  "gh pr create( .*)?",
  "gh pr ready( .*)?",
  "gh pr edit( [0-9]+)? --(title|body|body-file)( .*)?",
  String.raw`gh api graphql -f query='query ?[({][^']*'( --jq '[^']*')?`,
  String.raw`gh api graphql -f query='mutation\(\$id:ID!\)\{resolveReviewThread\(input:\{threadId:\$id\}\)\{thread\{isResolved\}\}\}' -f id=PRRT_[A-Za-z0-9_-]+`,
];

// How the agent drives the record-demo terminal (the tmux session `demo` on the virtual
// display) and turns its recording into a GIF. send-keys types into a real shell, so this
// bypasses the allow-list entirely - the reason record-demo is opt-in.
export const DEMO_RECORDING_ALLOW = [
  "tmux (send-keys|capture-pane)( .*)?",
  "ffmpeg( .*)?",
];

// Compose INFER_TOOLS_BASH_ALLOW_APPEND: GIT_WRITE_ALLOW when git operations are enabled
// (otherwise only the CLI's read-only baseline), DEMO_RECORDING_ALLOW when record-demo is on,
// then the consumer's `bash-allow-append`. The CLI splits on both `,` and `\n`, so
// newline-separated consumer input passes through unchanged.
export function composeBashAllowAppend(
  enableGitOps: boolean,
  bashAllowAppend: string,
  recordDemo = false,
): string {
  return [
    ...(enableGitOps ? GIT_WRITE_ALLOW : []),
    ...(recordDemo ? DEMO_RECORDING_ALLOW : []),
    bashAllowAppend.trim(),
  ]
    .filter(Boolean)
    .join(",");
}

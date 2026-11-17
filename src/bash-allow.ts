// Writes the agent needs to branch, stage, commit, push, recover from a staging
// mistake (restore/reset/stash), and open/ready/retitle its draft PR (never
// merge or close - a human reviews and merges). Entries are Go regexes anchored
// to the whole command (`git commit( .*)?` matches `git commit -m "x"` but not
// `git commitx`), and no entry may contain a comma.
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

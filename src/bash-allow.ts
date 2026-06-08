// Bash allow-list append wiring for the runner.
//
// The Infer CLI (v0.121.0+) owns the read-only bash baseline that every agent mode inherits
// (`tools.bash.mode.all.allow`): file reads, `echo/task/make/find`, read-only git
// (`git status|branch|log|diff|remote|show`), read-only gh (`gh <noun> list|view|status|diff|
// checks`, `gh auth status`, `gh search …`) and `gh project list|view|item-list|field-list`
// (the "read projects" access). Headless `infer agent` runs in standard mode, so it inherits
// exactly that baseline. The action therefore no longer ships its own read-only defaults — it
// only appends the *writes* its PR workflow needs, via the CLI's single append knob
// `INFER_TOOLS_BASH_ALLOW_APPEND`.
//
// Each entry is a Go regex; the CLI's matcher anchors it to the whole command, so an entry
// like `git commit( .*)?` matches `git commit` and `git commit -m "x"` but not `git commitx`.

// The writes the agent needs to branch, stage, commit, push, and open (never merge) a PR.
// `gh pr merge|close|edit|review` are deliberately absent: the agent opens a PR, a human
// merges it.
export const GIT_WRITE_ALLOW = [
  "git add( .*)?",
  "git commit( .*)?",
  "git push( .*)?",
  "git checkout( .*)?",
  "git switch( .*)?",
  "git fetch( .*)?",
  "gh pr create( .*)?",
];

// Compose the value for INFER_TOOLS_BASH_ALLOW_APPEND. When git operations are enabled we add
// GIT_WRITE_ALLOW; when disabled the agent keeps only the CLI's read-only baseline so it can
// analyze but never commit/push/open a PR by hand. The consumer's `bash-allow-append` (extra
// regex entries, comma/newline separated) is appended on top. The CLI splits the result on
// both `,` and `\n`, so newline-separated consumer input passes through unchanged.
export function composeBashAllowAppend(
  enableGitOps: boolean,
  bashAllowAppend: string,
): string {
  return [...(enableGitOps ? GIT_WRITE_ALLOW : []), bashAllowAppend.trim()]
    .filter(Boolean)
    .join(",");
}

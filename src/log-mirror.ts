// Which of the agent child process's streams the runner mirrors to the GitHub
// Actions run log. The two streams are deliberately decoupled:
//
// - stdout is the verbose JSON-line firehose - tool inputs/outputs, file
//   contents, web-fetch payloads - and is mirrored *raw* (only registered
//   secrets are masked via ::add-mask::; incidental sensitive content is not).
//   It is both noisy and a disclosure surface, so mirroring it is opt-in:
//   INFER_MIRROR_AGENT_LOGS must be exactly "true". Unset, empty, "false", or
//   anything else mutes it. Either way the full stream is teed to
//   /tmp/agent-output.txt for the redacted cooking-comment footer, so muting
//   it loses nothing post-results needs.
//
// - stderr is low-volume diagnostics - crashes, panics, stack-traces - so it is
//   *always* mirrored, independent of the gate, to keep an agent failure
//   visible in the run log even when the stdout transcript is muted. Quiet
//   *and* debuggable by default.
export function planLogMirroring(env: NodeJS.ProcessEnv): {
  stdout: boolean;
  stderr: boolean;
} {
  return {
    stdout: env["INFER_MIRROR_AGENT_LOGS"] === "true",
    stderr: true,
  };
}

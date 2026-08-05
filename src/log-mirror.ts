// Which of the agent child process's streams the runner mirrors to the GitHub
// Actions run log. The two streams are deliberately decoupled:
//
// - stdout is the verbose JSON-line firehose - tool inputs/outputs, file
//   contents, web-fetch payloads - and is mirrored *raw* (only registered
//   secrets are masked via ::add-mask::; incidental sensitive content is not).
//   It is both noisy and a disclosure surface, so mirroring is opt-in: an
//   explicit INFER_MIRROR_AGENT_LOGS wins outright, and when it is unset or
//   empty the gate follows INFER_LOGGING_DEBUG - a debug run mirrors unless
//   the consumer explicitly set mirror-agent-logs to false. Truthy values are
//   case-insensitive "true" or "1". Either way the full stream is teed to
//   /tmp/agent-output.txt for the redacted cooking-comment footer, so muting
//   it loses nothing post-results needs.
//
// - stderr is low-volume diagnostics - crashes, panics, stack-traces - so it is
//   *always* mirrored, independent of the gate, to keep an agent failure
//   visible in the run log even when the stdout transcript is muted. Quiet
//   *and* debuggable by default.

// truthy accepts the string forms a workflow can plausibly send for a boolean
// input: true/True/TRUE (YAML booleans stringify to "true", but hand-typed
// variants happen) and "1".
const truthy = (v: string | undefined): boolean =>
  /^(true|1)$/i.test((v ?? "").trim());

export function planLogMirroring(env: NodeJS.ProcessEnv): {
  stdout: boolean;
  stderr: boolean;
} {
  const explicit = (env["INFER_MIRROR_AGENT_LOGS"] ?? "").trim();
  return {
    stdout:
      explicit !== "" ? truthy(explicit) : truthy(env["INFER_LOGGING_DEBUG"]),
    stderr: true,
  };
}

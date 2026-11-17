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

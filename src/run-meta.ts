export interface RunMeta {
  model: string;
  actionVersion: string;
  cliVersion: string;
  gatewayVersion: string;
  workflowUrl: string;
}

/** Builds the run identity from the step env; the model name is passed in because runner and report receive it under different names, and the gateway version fills in at runtime instead (it only exists once the CLI's managed gateway is up). */
export function readRunMeta(
  env: NodeJS.ProcessEnv,
  model: string,
  gatewayVersion = "",
): RunMeta {
  return {
    model,
    actionVersion: env["INFER_ACTION_VERSION"] ?? "",
    cliVersion: env["INFER_CLI_VERSION"] ?? "",
    gatewayVersion,
    workflowUrl: env["INFER_WORKFLOW_URL"] ?? "",
  };
}

/** Renders the one Model · Action · CLI · Gateway · View Job line shown in the comment header and footer. */
export function renderRunMeta(meta: RunMeta): string {
  return [
    `**Model:** \`${meta.model}\``,
    meta.actionVersion
      ? `**Action:** ${actionVersionLink(meta.actionVersion)}`
      : "",
    meta.cliVersion ? `**CLI:** \`${meta.cliVersion}\`` : "",
    meta.gatewayVersion
      ? `**Gateway:** \`${versionLabel(meta.gatewayVersion)}\``
      : "",
    meta.workflowUrl ? `[View Job](${meta.workflowUrl})` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Numeric versions render with a v prefix (0.50.0 -> v0.50.0); labels like "dev" pass through unchanged. */
export function versionLabel(v: string): string {
  const first = v[0] ?? "";
  return first >= "0" && first <= "9" ? `v${v}` : v;
}

/** A pinned tag links to its release, a pinned SHA to the commit. */
export function actionVersionLink(version: string): string {
  const url = /^[0-9a-f]{40}$/.test(version)
    ? `https://github.com/inference-gateway/infer-action/commit/${version}`
    : `https://github.com/inference-gateway/infer-action/releases/tag/${version}`;
  return `[\`${version}\`](${url})`;
}

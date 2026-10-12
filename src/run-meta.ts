export interface RunMeta {
  model: string;
  actionVersion: string;
  cliVersion: string;
  workflowUrl: string;
}

/** Builds the run identity from the step env; the model name is passed in because runner and report receive it under different names. */
export function readRunMeta(env: NodeJS.ProcessEnv, model: string): RunMeta {
  return {
    model,
    actionVersion: env["INFER_ACTION_VERSION"] ?? "",
    cliVersion: env["INFER_CLI_VERSION"] ?? "",
    workflowUrl: env["INFER_WORKFLOW_URL"] ?? "",
  };
}

/** Renders the one Model · Action · CLI · View Job line shown in the comment header and footer. */
export function renderRunMeta(meta: RunMeta): string {
  return [
    `**Model:** \`${meta.model}\``,
    meta.actionVersion
      ? `**Action:** ${actionVersionLink(meta.actionVersion)}`
      : "",
    meta.cliVersion ? `**CLI:** \`${meta.cliVersion}\`` : "",
    meta.workflowUrl ? `[View Job](${meta.workflowUrl})` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A pinned tag links to its release, a pinned SHA to the commit. */
export function actionVersionLink(version: string): string {
  const url = /^[0-9a-f]{40}$/.test(version)
    ? `https://github.com/inference-gateway/infer-action/commit/${version}`
    : `https://github.com/inference-gateway/infer-action/releases/tag/${version}`;
  return `[\`${version}\`](${url})`;
}

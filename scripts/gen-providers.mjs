#!/usr/bin/env bun
// Regenerates the per-provider API-key wiring from a single source of truth:
// the `Provider` enum in the inference-gateway/schemas openapi.yaml. Rewrites the
// regions between the `# BEGIN/END generated: <name>` sentinels in action.yml and
// src/redact.ts, plus the provider rows in the README inputs table. Adding a
// provider upstream becomes: bump SCHEMAS_REF -> `task generate` -> commit.
//
// Do NOT hand-edit the generated regions; edit this script instead. Formatting is
// left to prettier (`bun run generate` runs `format:write` after this), so the
// emitted rows/rows can be loosely padded.
//
// Source: live-fetches openapi.yaml at the pinned SCHEMAS_REF. Override the ref
// with $SCHEMAS_REF, or read a local spec (offline/tests) with
// $INFER_SCHEMAS_OPENAPI=<path-to-openapi.yaml>.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const SCHEMAS_REF = process.env.SCHEMAS_REF || "v0.6.1";
const SCHEMAS_URL = `https://raw.githubusercontent.com/inference-gateway/schemas/${SCHEMAS_REF}/openapi.yaml`;

// Providers that do not need an API key (URL-only, e.g. local inference servers).
const NO_API_KEY_PROVIDERS = new Set(["ollama", "llamacpp"]);

// Display names that are not a plain title-case of the provider id.
const DISPLAY_OVERRIDES = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  minimax: "MiniMax",
  ollama_cloud: "Ollama Cloud",
  llamacpp: "llama.cpp",
};

// Input descriptions that carry more than the uniform template.
const DESCRIPTION_OVERRIDES = {
  google: "Google API key (required if using Google/Gemini models)",
};

const titleCase = (id) =>
  id
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const displayName = (id) => DISPLAY_OVERRIDES[id] ?? titleCase(id);
const envName = (id, kind) => `${id.toUpperCase()}_API_${kind.toUpperCase()}`;
const inputName = (id, kind) => `${id.replaceAll("_", "-")}-api-${kind}`;
const noun = (kind) => (kind === "url" ? "URL" : "key");
const description = (id, kind) =>
  (kind === "key" && DESCRIPTION_OVERRIDES[id]) ||
  `${displayName(id)} API ${noun(kind)} (required if using ${displayName(id)} models)`;

async function loadProviderIds() {
  const local = process.env.INFER_SCHEMAS_OPENAPI;
  let text;
  if (local) {
    text = readFileSync(local, "utf8");
  } else {
    let res;
    try {
      res = await fetch(SCHEMAS_URL);
    } catch (cause) {
      throw new Error(`could not reach ${SCHEMAS_URL}: ${cause.message}`);
    }
    if (!res.ok) {
      throw new Error(
        `failed to fetch ${SCHEMAS_URL}: ${res.status} ${res.statusText}`,
      );
    }
    text = await res.text();
  }
  const doc = Bun.YAML.parse(text);
  const ids = doc?.components?.schemas?.Provider?.enum;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    !ids.every((x) => typeof x === "string")
  ) {
    throw new Error(
      "could not read components.schemas.Provider.enum (a non-empty string[]) from the spec",
    );
  }
  return ids;
}

// Replace the body between every `BEGIN generated: <name>` / `END generated: <name>`
// sentinel pair (keeping the sentinel lines themselves) with `body`. Handles both
// `#` (YAML/bash) and `//` (TS) comment sentinels, tolerates any leading whitespace
// (so a prettier reindent never desyncs the anchors), and rewrites all occurrences
// (e.g. `provider-env` appears on four steps).
function replaceRegion(text, name, body) {
  const re = new RegExp(
    `([ \\t]*(?:#|//)[ \\t]*BEGIN generated: ${name}\\b[^\\n]*\\n)[\\s\\S]*?([ \\t]*(?:#|//)[ \\t]*END generated: ${name}\\b[^\\n]*)`,
    "g",
  );
  let count = 0;
  const out = text.replace(re, (_m, begin, end) => {
    count++;
    return `${begin}${body}\n${end}`;
  });
  if (count === 0) throw new Error(`no '${name}' sentinel region found`);
  return out;
}

// The README provider rows carry no sentinel (an HTML comment between table rows
// splits the table), so replace the maximal contiguous run of table-cell rows.
function replaceReadmeRows(text, rows) {
  const rowRe = /^\|\s*`[a-z0-9-]+-api-(key|url)`\s*\|/;
  const lines = text.split("\n");
  const matched = [];
  for (let i = 0; i < lines.length; i++)
    if (rowRe.test(lines[i])) matched.push(i);
  if (matched.length === 0)
    throw new Error("no provider rows found in the README inputs table");
  const first = matched[0];
  const last = matched[matched.length - 1];
  if (last - first + 1 !== matched.length) {
    throw new Error(
      `README provider rows are not contiguous (lines ${first + 1}..${last + 1})`,
    );
  }
  lines.splice(first, last - first + 1, ...rows);
  return lines.join("\n");
}

const ids = await loadProviderIds();
const apiKeyIds = ids.filter((id) => !NO_API_KEY_PROVIDERS.has(id));

const actionPath = resolve(repoRoot, "action.yml");
const redactPath = resolve(repoRoot, "src", "redact.ts");
const readmePath = resolve(repoRoot, "README.md");

// action.yml: inputs, the four `env:` blocks, the resolution `case`, the debug print.
// Key and url providers share the regions; entries are (id, kind) pairs.
const urlIds = [...NO_API_KEY_PROVIDERS].sort();
const entries = [
  ...apiKeyIds.map((id) => [id, "key"]),
  ...urlIds.map((id) => [id, "url"]),
];
let action = readFileSync(actionPath, "utf8");
const inputsBody = entries
  .map(
    ([id, kind]) =>
      `  ${inputName(id, kind)}:\n    description: "${description(id, kind)}"\n    required: false`,
  )
  .join("\n\n");
const envBody = entries
  .map(
    ([id, kind]) =>
      `        ${envName(id, kind)}: \${{ inputs.${inputName(id, kind)} }}`,
  )
  .join("\n");
const caseBody = apiKeyIds
  .map((id) => `              ${id}) key="\${${envName(id, "key")}:-}" ;;`)
  .join("\n");
const debugBody = entries
  .map(
    ([id, kind]) =>
      `        printf '%-30s %s\\n' "${inputName(id, kind)}:" "$(state "\${${envName(id, kind)}:-}")"`,
  )
  .join("\n");
action = replaceRegion(action, "provider-inputs", inputsBody);
action = replaceRegion(action, "provider-env", envBody);
action = replaceRegion(action, "provider-case", caseBody);
action = replaceRegion(action, "provider-debug", debugBody);
writeFileSync(actionPath, action);

let redact = readFileSync(redactPath, "utf8");
const secretsBody = apiKeyIds
  .map((id) => `  "${envName(id, "key")}",`)
  .join("\n");
redact = replaceRegion(redact, "provider-secrets", secretsBody);
writeFileSync(redactPath, redact);

let readme = readFileSync(readmePath, "utf8");
const readmeRows = entries.map(
  ([id, kind]) =>
    `| \`${inputName(id, kind)}\` | ${displayName(id)} API ${noun(kind)} | No\\* | - |`,
);
readme = replaceReadmeRows(readme, readmeRows);
writeFileSync(readmePath, readme);

const source = process.env.INFER_SCHEMAS_OPENAPI || SCHEMAS_URL;
console.log(
  `Generated provider wiring for ${ids.length} providers from ${source}`,
);
console.log(`  ${ids.join(", ")}`);

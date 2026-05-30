#!/usr/bin/env node
// Reads src/prompts/*.md and emits src/prompts.gen.ts as a typed
// constant map. Run before typecheck/test/package so the .gen.ts is
// in sync with the markdown sources. The .gen.ts is gitignored.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const promptsDir = join(repoRoot, "src", "prompts");
const outFile = join(repoRoot, "src", "prompts.gen.ts");

const files = readdirSync(promptsDir)
  .filter((f) => f.endsWith(".md"))
  .sort();

if (files.length === 0) {
  console.error(`No .md files found in ${promptsDir}`);
  process.exit(1);
}

const entries = files.map((f) => {
  const slug = f.replace(/\.md$/, "");
  const key = slug.replace(/-/g, "_").toUpperCase();
  const content = readFileSync(join(promptsDir, f), "utf8").replace(/\s+$/, "");
  return `  ${key}: ${JSON.stringify(content)},`;
});

const body = `// AUTO-GENERATED from src/prompts/*.md - do not edit.
// Regenerate with: node scripts/build-prompts.mjs

export const PROMPTS = {
${entries.join("\n")}
} as const;

export type PromptKey = keyof typeof PROMPTS;
`;

writeFileSync(outFile, body);
console.log(`Generated ${outFile} with ${files.length} prompts.`);

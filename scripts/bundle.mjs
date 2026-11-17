#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUN_SHEBANG = "#!/usr/bin/env bun";

const ENTRYPOINTS = [
  { entry: "src/runner.ts", outdir: "dist/runner" },
  { entry: "src/salvage.ts", outdir: "dist/salvage" },
  { entry: "src/report.ts", outdir: "dist/report" },
];

for (const { entry, outdir } of ENTRYPOINTS) {
  const result = await Bun.build({
    entrypoints: [join(repoRoot, entry)],
    outdir: join(repoRoot, outdir),
    target: "bun",
    format: "esm",
    naming: "index.[ext]",
    minify: true,
  });
  if (!result.success) {
    console.error(`bundle failed for ${entry}`);
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }

  const outPath = join(repoRoot, outdir, "index.js");
  let code = readFileSync(outPath, "utf8");
  code = code.startsWith("#!")
    ? code.replace(/^#![^\n]*\n/, `${BUN_SHEBANG}\n`)
    : `${BUN_SHEBANG}\n${code}`;
  writeFileSync(outPath, code);
  writeFileSync(
    join(repoRoot, outdir, "package.json"),
    `{\n  "type": "module"\n}\n`,
  );
  console.log(
    `bundled ${entry} -> ${outdir}/index.js (${Math.round(code.length / 1024)} KB)`,
  );
}

#!/usr/bin/env bun
// Bundle the three TypeScript entrypoints into self-contained, bun-runnable
// ESM files under dist/<name>/index.js. Replaces @vercel/ncc (which required
// Node). Run with: bun run package
//
// There are no production dependencies, so the bundles contain only first-party
// code and no third-party license aggregation is needed. If a runtime dep is
// ever added, reintroduce a licenses.txt next to each bundle (ncc's --license
// equivalent) to keep redistribution compliant.
//
// Output runs under `bun dist/<name>/index.js` on the consumer runner; there
// is no Node in the toolchain. The dist/ is committed and verified byte-stable
// by CI's `git diff --exit-code dist/`, so this build must be deterministic for
// a given Bun version (CI and flox are pinned to the same Bun).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUN_SHEBANG = "#!/usr/bin/env bun";

const rootPkg = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
);
const INFER_VERSION = rootPkg.version;

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
    define: {
      __INFER_VERSION__: JSON.stringify(INFER_VERSION),
    },
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

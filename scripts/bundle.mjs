#!/usr/bin/env bun
// Bundle the three TypeScript entrypoints into self-contained, bun-runnable
// ESM files under dist/<name>/index.js, then aggregate the third-party license
// texts next to each bundle. Replaces @vercel/ncc (which required Node and
// supplied the `--license` aggregation natively). Run with: bun run package
//
// Output runs under `bun dist/<name>/index.js` on the consumer runner; there
// is no Node in the toolchain. The dist/ is committed and verified byte-stable
// by CI's `git diff --exit-code dist/`, so this build must be deterministic for
// a given Bun version (CI and flox are pinned to the same Bun).
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
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

const licenses = collectProductionLicenses();

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
  writeFileSync(join(repoRoot, outdir, "licenses.txt"), licenses);
  writeFileSync(
    join(repoRoot, outdir, "package.json"),
    `{\n  "type": "module"\n}\n`,
  );
  console.log(
    `bundled ${entry} -> ${outdir}/index.js (${Math.round(code.length / 1024)} KB)`,
  );
}

// Walk the production dependency closure (package.json `dependencies`,
// transitively) and concatenate each package's name@version, declared license,
// and LICENSE file text. Deterministic: deps are visited in sorted order.
//
// NOTE: This walker assumes a fully-hoisted node_modules layout (Bun's default).
// If a future transitive dep is nested under another dep's node_modules, it will
// be silently skipped (existsSync returns false for the top-level path). That
// would create a licenses.txt completeness gap, not an action-correctness one.
function collectProductionLicenses() {
  const root = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const seen = new Set();
  const queue = Object.keys(root.dependencies ?? {}).sort();
  const blocks = [];
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const pkgDir = join(repoRoot, "node_modules", name);
    const pkgJsonPath = join(pkgDir, "package.json");
    if (!existsSync(pkgJsonPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    const license =
      typeof pkg.license === "string"
        ? pkg.license
        : (pkg.license?.type ??
          pkg.licenses?.map((l) => l.type).join(", ") ??
          "UNKNOWN");
    blocks.push(
      [
        `${pkg.name}@${pkg.version}`,
        license,
        readLicenseText(pkgDir),
        "-".repeat(72),
      ].join("\n"),
    );
    for (const dep of Object.keys(pkg.dependencies ?? {}).sort()) {
      if (!seen.has(dep)) queue.push(dep);
    }
  }
  return blocks.join("\n") + "\n";
}

function readLicenseText(pkgDir) {
  const candidates = readdirSync(pkgDir).filter((f) =>
    /^licen[sc]e(\.|$)/i.test(f),
  );
  if (candidates.length === 0) return "(no LICENSE file found)";
  candidates.sort();
  return readFileSync(join(pkgDir, candidates[0]), "utf8").trimEnd();
}

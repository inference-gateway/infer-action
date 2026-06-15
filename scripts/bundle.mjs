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

const ENTRYPOINTS = [
  { entry: "src/runner.ts", outdir: "dist/runner" },
  { entry: "src/post-results.ts", outdir: "dist/post-results" },
  { entry: "src/recover.ts", outdir: "dist/recover" },
];

const licenses = collectProductionLicenses();

for (const { entry, outdir } of ENTRYPOINTS) {
  const result = await Bun.build({
    entrypoints: [join(repoRoot, entry)],
    outdir: join(repoRoot, outdir),
    target: "bun",
    format: "esm",
    naming: "index.[ext]",
  });
  if (!result.success) {
    console.error(`bundle failed for ${entry}`);
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  // Bun.build emits a `#!/usr/bin/env node` shebang; rewrite it to bun. The
  // shebang is cosmetic (the action invokes `bun <file>` explicitly) but a node
  // shebang in a bun-only project is misleading.
  const outPath = join(repoRoot, outdir, "index.js");
  let code = readFileSync(outPath, "utf8");
  code = code.startsWith("#!")
    ? code.replace(/^#![^\n]*\n/, `${BUN_SHEBANG}\n`)
    : `${BUN_SHEBANG}\n${code}`;
  writeFileSync(outPath, code);
  writeFileSync(join(repoRoot, outdir, "licenses.txt"), licenses);
  console.log(
    `bundled ${entry} -> ${outdir}/index.js (${Math.round(code.length / 1024)} KB)`,
  );
}

// Walk the production dependency closure (package.json `dependencies`,
// transitively) and concatenate each package's name@version, declared license,
// and LICENSE file text. Deterministic: deps are visited in sorted order.
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
  return readFileSync(join(pkgDir, candidates[0]), "utf8").trimEnd();
}

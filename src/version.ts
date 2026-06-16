/**
 * Build-time version constant.
 *
 * At bundle time (`scripts/bundle.mjs` → `Bun.build`) the `__INFER_VERSION__`
 * global is replaced with the actual version from `package.json` via the
 * `define` option, so the version is baked into the shipped JavaScript.
 *
 * In tests and dev the fallback reads `package.json` directly.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

declare const __INFER_VERSION__: string | undefined;

export const INFER_VERSION: string =
  typeof __INFER_VERSION__ !== "undefined"
    ? __INFER_VERSION__
    : (() => {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const pkg = JSON.parse(
          readFileSync(join(__dirname, "..", "package.json"), "utf8"),
        );
        return pkg.version;
      })();

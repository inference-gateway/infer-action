import { describe, expect, test } from "bun:test";

const action = await Bun.file(new URL("../action.yml", import.meta.url)).text();

describe("enable-git-hooks / hooks-path in action.yml", () => {
  test("inputs exist with the documented defaults", () => {
    expect(action).toMatch(
      /enable-git-hooks:\n\s+description: "Enable the repo's own git hooks[\s\S]*?"\n\s+required: false\n\s+default: "true"/,
    );
    expect(action).toMatch(
      /hooks-path:\n\s+description: "Hooks directory wired via git config core\.hooksPath[\s\S]*?"\n\s+required: false\n\s+default: "\.githooks"/,
    );
  });

  test("Configure Git step gates on the flag, checks the dir, and configures hooksPath", () => {
    expect(action).toMatch(
      /ENABLE_GIT_HOOKS: \$\{\{ inputs\.enable-git-hooks \}\}/,
    );
    expect(action).toMatch(/HOOKS_PATH: \$\{\{ inputs\.hooks-path \}\}/);
    expect(action).toMatch(
      /\[\[ "\$\{ENABLE_GIT_HOOKS:-true\}" == "true" \]\]/,
    );
    expect(action).toMatch(
      /if \[\[ -d "\$HOOKS" \]\]; then\n\s+git config core\.hooksPath "\$HOOKS"/,
    );
  });
});

import { describe, expect, it } from "bun:test";
import { buildChildEnv } from "../src/runner.js";

const OPTS = {
  systemPrompt: "SYSTEM PROMPT SENTINEL",
  bashAllowAppend: "git add( .*)?,git commit( .*)?",
  remindersYaml: "reminders:\n  merge: true\n",
};

describe("buildChildEnv", () => {
  // These exact names are a contract with the Infer CLI's env-override layer.
  // The CLI silently ignores unknown env vars, so a rename here (or upstream)
  // drops the action's GitHub instructions without any error - exactly what
  // happened when the CLI moved the prompt config in v0.105.0.
  it("sets the system prompt under every env name the CLI honours", () => {
    const env = buildChildEnv({}, OPTS);
    // CLI >= v0.105.0 (prompts.agent.system_prompt).
    expect(env["INFER_PROMPTS_AGENT_SYSTEM_PROMPT"]).toBe(OPTS.systemPrompt);
    // CLI < v0.105.0 (agent.system_prompt), kept for older pins.
    expect(env["INFER_AGENT_SYSTEM_PROMPT"]).toBe(OPTS.systemPrompt);
    // Claude Code subscription mode (appended via --append-system-prompt).
    expect(env["INFER_PROMPTS_AGENT_SYSTEM_PROMPT_CLAUDE_CODE"]).toBe(
      OPTS.systemPrompt,
    );
  });

  it("pins the CLI's dynamic context block on", () => {
    const env = buildChildEnv({}, OPTS);
    expect(env["INFER_AGENT_SYSTEM_PROMPT_WITH_DEFAULTS"]).toBe("true");
  });

  it("threads the bash allow append and reminders config through", () => {
    const env = buildChildEnv({}, OPTS);
    expect(env["INFER_TOOLS_BASH_ALLOW_APPEND"]).toBe(OPTS.bashAllowAppend);
    expect(env["INFER_REMINDERS_CONFIG"]).toBe(OPTS.remindersYaml);
  });

  it("inherits the base environment but wins on conflicts", () => {
    const env = buildChildEnv(
      {
        PATH: "/usr/bin",
        INFER_AGENT_SYSTEM_PROMPT_WITH_DEFAULTS: "false",
        INFER_PROMPTS_AGENT_SYSTEM_PROMPT: "stale consumer value",
      },
      OPTS,
    );
    expect(env["PATH"]).toBe("/usr/bin");
    expect(env["INFER_AGENT_SYSTEM_PROMPT_WITH_DEFAULTS"]).toBe("true");
    expect(env["INFER_PROMPTS_AGENT_SYSTEM_PROMPT"]).toBe(OPTS.systemPrompt);
  });
});

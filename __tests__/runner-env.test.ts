import { describe, expect, it } from "bun:test";
import { buildChildEnv, redactMemoryIndex } from "../src/runner.js";

const OPTS = {
  systemPrompt: "SYSTEM PROMPT SENTINEL",
  bashAllowAppend: "git add( .*)?,git commit( .*)?",
  remindersYaml: "reminders:\n  merge: true\n",
};

describe("buildChildEnv", () => {
  it("sets the env vars the CLI honours", () => {
    const env = buildChildEnv({}, OPTS);
    expect(env["INFER_PROMPTS_AGENT_SYSTEM_PROMPT"]).toBe(OPTS.systemPrompt);
    expect(env["INFER_AGENT_SYSTEM_PROMPT_WITH_DEFAULTS"]).toBe("true");
    expect(env["INFER_TOOLS_BASH_ALLOW_APPEND"]).toBe(OPTS.bashAllowAppend);
    expect(env["INFER_REMINDERS_CONFIG"]).toBe(OPTS.remindersYaml);
  });

  it("passes through OTel env vars from the base environment", () => {
    const env = buildChildEnv(
      {
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318",
        OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer token",
        OTEL_SERVICE_NAME: "my-custom-service",
        OTEL_RESOURCE_ATTRIBUTES: "env=prod,team=platform",
      },
      OPTS,
    );
    expect(env["OTEL_EXPORTER_OTLP_ENDPOINT"]).toBe("http://collector:4318");
    expect(env["OTEL_EXPORTER_OTLP_HEADERS"]).toBe(
      "Authorization=Bearer token",
    );
    expect(env["OTEL_SERVICE_NAME"]).toBe("my-custom-service");
    expect(env["OTEL_RESOURCE_ATTRIBUTES"]).toBe("env=prod,team=platform");
  });

  it("defaults OTel env vars when not set in base", () => {
    const env = buildChildEnv({}, OPTS);
    expect(env["OTEL_EXPORTER_OTLP_ENDPOINT"]).toBe("");
    expect(env["OTEL_EXPORTER_OTLP_HEADERS"]).toBe("");
    expect(env["OTEL_SERVICE_NAME"]).toBe("infer-action");
    expect(env["OTEL_RESOURCE_ATTRIBUTES"]).toBe("");
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

describe("redactMemoryIndex", () => {
  const prompt =
    "# Prompt\n\nPERSISTENT MEMORY INDEX (facts):\n- [secret-fact](f.md) - detail\n\nCurrent date: Monday";

  it("collapses the memory section when debug is off", () => {
    const out = redactMemoryIndex(prompt, false);
    expect(out).not.toContain("secret-fact");
    expect(out).toContain("PERSISTENT MEMORY INDEX: [redacted");
    expect(out).toContain("Current date: Monday");
  });

  it("keeps the prompt intact when debug is on", () => {
    expect(redactMemoryIndex(prompt, true)).toBe(prompt);
  });

  it("passes prompts without a memory section through", () => {
    expect(redactMemoryIndex("no memory here", false)).toBe("no memory here");
  });
});

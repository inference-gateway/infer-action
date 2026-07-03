import { describe, expect, it, spyOn } from "bun:test";
import {
  collectSecretValues,
  createRedactor,
  emitAddMaskDirectives,
  SECRET_ENV_NAMES,
} from "../src/redact.js";

describe("collectSecretValues", () => {
  it("returns empty when no secret env vars are set", () => {
    expect(collectSecretValues({}, SECRET_ENV_NAMES)).toEqual([]);
  });

  it("collects values for the configured names", () => {
    const env: NodeJS.ProcessEnv = {
      GITHUB_TOKEN: "ghp_abcdefgh12345678",
      ANTHROPIC_API_KEY: "sk-ant-abcdef12345678",
    };
    expect(collectSecretValues(env, SECRET_ENV_NAMES)).toEqual([
      "ghp_abcdefgh12345678",
      "sk-ant-abcdef12345678",
    ]);
  });

  it("skips values shorter than the default minLength of 8", () => {
    const env: NodeJS.ProcessEnv = { GITHUB_TOKEN: "short" };
    expect(collectSecretValues(env, SECRET_ENV_NAMES)).toEqual([]);
  });

  it("skips whitespace-only values", () => {
    const env: NodeJS.ProcessEnv = { GITHUB_TOKEN: "          " };
    expect(collectSecretValues(env, SECRET_ENV_NAMES)).toEqual([]);
  });

  it("deduplicates when two env names share the same value", () => {
    const env: NodeJS.ProcessEnv = {
      GITHUB_TOKEN: "shared-secret-value-1234",
      ANTHROPIC_API_KEY: "shared-secret-value-1234",
    };
    expect(collectSecretValues(env, SECRET_ENV_NAMES)).toEqual([
      "shared-secret-value-1234",
    ]);
  });

  it("honors a custom minLength override", () => {
    const env: NodeJS.ProcessEnv = { GITHUB_TOKEN: "abc1234" };
    expect(collectSecretValues(env, SECRET_ENV_NAMES, 4)).toEqual(["abc1234"]);
    expect(collectSecretValues(env, SECRET_ENV_NAMES, 10)).toEqual([]);
  });

  it("ignores env names not in the provided list", () => {
    const env: NodeJS.ProcessEnv = {
      SOME_OTHER_KEY: "value-not-in-list-12345",
    };
    expect(collectSecretValues(env, SECRET_ENV_NAMES)).toEqual([]);
  });

  it("collects the memory-remote credentials", () => {
    const env: NodeJS.ProcessEnv = {
      MEMORY_TOKEN: "ghs_memorytoken1234567890",
      MEMORY_DEPLOY_KEY:
        "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAAfakekeymaterial\n-----END OPENSSH PRIVATE KEY-----",
    };
    expect(collectSecretValues(env, SECRET_ENV_NAMES)).toEqual([
      "ghs_memorytoken1234567890",
      "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAAfakekeymaterial\n-----END OPENSSH PRIVATE KEY-----",
    ]);
  });
});

describe("createRedactor", () => {
  it("is identity when env has no secrets and heuristics is off", () => {
    const r = createRedactor({ env: {}, heuristics: false });
    expect(r.secretCount).toBe(0);
    expect(r.redact("anything goes here ghp_definitely-not-real")).toBe(
      "anything goes here ghp_definitely-not-real",
    );
  });

  it("replaces a known secret value with the default placeholder", () => {
    const r = createRedactor({
      env: { GITHUB_TOKEN: "ghp_abc123xyz45678" },
    });
    expect(r.redact("token=ghp_abc123xyz45678 end")).toBe("token=*** end");
  });

  it("replaces all occurrences of a known secret value", () => {
    const r = createRedactor({
      env: { GITHUB_TOKEN: "ghp_abcdefghij1234567890" },
    });
    expect(
      r.redact("a ghp_abcdefghij1234567890 b ghp_abcdefghij1234567890 c"),
    ).toBe("a *** b *** c");
  });

  it("handles two secrets where one is a substring of the other (longest-first ordering)", () => {
    const env: NodeJS.ProcessEnv = {
      GITHUB_TOKEN: "abcdef-prefix-1234567890",
      ANTHROPIC_API_KEY: "prefix-12345678",
    };
    const r = createRedactor({ env });
    expect(r.redact("X abcdef-prefix-1234567890 Y prefix-12345678 Z")).toBe(
      "X *** Y *** Z",
    );
  });

  it("escapes regex metacharacters in secret values", () => {
    const env: NodeJS.ProcessEnv = { GITHUB_TOKEN: "secret$^.*+?()[]" };
    const r = createRedactor({ env });
    expect(r.redact("here is secret$^.*+?()[] inline")).toBe(
      "here is *** inline",
    );
  });

  it("does not match heuristic token shapes when heuristics is off", () => {
    const r = createRedactor({ env: {}, heuristics: false });
    const tok = "ghp_" + "a".repeat(40);
    expect(r.redact(`token=${tok}`)).toBe(`token=${tok}`);
  });

  it("matches heuristic token shapes when heuristics is on", () => {
    const r = createRedactor({ env: {}, heuristics: true });
    const cases = [
      "ghp_" + "a".repeat(40),
      "gho_" + "B".repeat(36),
      "github_pat_" + "A".repeat(82),
      "AIza" + "x".repeat(35),
      "sk-" + "a".repeat(40),
      "xoxb-" + "c".repeat(24),
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    ];
    for (const c of cases) {
      expect(r.redact(`prefix ${c} suffix`)).toBe("prefix *** suffix");
    }
  });

  it("does not match JWT shape when heuristics is off", () => {
    const r = createRedactor({ env: {}, heuristics: false });
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.dGVzdHNpZ25hdHVyZQ";
    expect(r.redact(`auth: Bearer ${jwt}`)).toBe(`auth: Bearer ${jwt}`);
  });

  it("honors a custom placeholder", () => {
    const r = createRedactor({
      env: { GITHUB_TOKEN: "ghp_abc12345678901234" },
      placeholder: "[REDACTED]",
    });
    expect(r.redact("ghp_abc12345678901234")).toBe("[REDACTED]");
  });

  it("returns the empty string unchanged", () => {
    const r = createRedactor({ env: { GITHUB_TOKEN: "ghp_abcd1234567890ab" } });
    expect(r.redact("")).toBe("");
  });

  it("redacts PEM private-key blocks unconditionally (heuristics off)", () => {
    const r = createRedactor({ env: {}, heuristics: false });
    const pem = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEAuFakeKeyContent12345==",
      "MoreFakeKeyContent67890ABCDE==",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const input = `before\n${pem}\nafter`;
    const out = r.redact(input);
    expect(out).not.toContain("BEGIN RSA PRIVATE KEY");
    expect(out).not.toContain("FakeKeyContent");
    expect(out).toContain("before\n***\nafter");
  });

  it("redacts a PGP PRIVATE KEY BLOCK", () => {
    const r = createRedactor({ env: {}, heuristics: false });
    const pem = [
      "-----BEGIN PGP PRIVATE KEY BLOCK-----",
      "lQOYBFakePgpKeyMaterial1234567890==",
      "-----END PGP PRIVATE KEY BLOCK-----",
    ].join("\n");
    expect(r.redact(`x\n${pem}\ny`)).toBe("x\n***\ny");
  });

  it("does NOT redact public CERTIFICATE blocks", () => {
    const r = createRedactor({ env: {}, heuristics: true });
    const cert = [
      "-----BEGIN CERTIFICATE-----",
      "MIIDazCCAlOgFakeCertContent==",
      "-----END CERTIFICATE-----",
    ].join("\n");
    expect(r.redact(`server cert:\n${cert}`)).toBe(`server cert:\n${cert}`);
  });

  it("does not bleed across two adjacent private-key blocks", () => {
    const r = createRedactor({ env: {}, heuristics: false });
    const pem1 = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "AAA111",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const pem2 = [
      "-----BEGIN EC PRIVATE KEY-----",
      "BBB222",
      "-----END EC PRIVATE KEY-----",
    ].join("\n");
    const out = r.redact(`${pem1}\nmid\n${pem2}`);
    expect(out).toBe("***\nmid\n***");
  });

  it("redacts a memory token collected from env", () => {
    const r = createRedactor({
      env: { MEMORY_TOKEN: "ghs_memorytoken1234567890" },
    });
    expect(r.redact("push to https://x:ghs_memorytoken1234567890@x")).toBe(
      "push to https://x:***@x",
    );
  });

  it("reports secretCount based on collected values", () => {
    const env: NodeJS.ProcessEnv = {
      GITHUB_TOKEN: "ghp_abc12345678901234",
      ANTHROPIC_API_KEY: "sk-ant-abcdef12345678",
    };
    const r = createRedactor({ env });
    expect(r.secretCount).toBe(2);
  });
});

describe("emitAddMaskDirectives", () => {
  it("writes one ::add-mask:: line per unique value", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      emitAddMaskDirectives(["alpha", "beta", "alpha"]);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenNthCalledWith(1, "::add-mask::alpha\n");
      expect(spy).toHaveBeenNthCalledWith(2, "::add-mask::beta\n");
    } finally {
      spy.mockRestore();
    }
  });

  it("skips empty values", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      emitAddMaskDirectives(["", "valid"]);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("::add-mask::valid\n");
    } finally {
      spy.mockRestore();
    }
  });

  it("is a no-op for an empty array", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      emitAddMaskDirectives([]);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

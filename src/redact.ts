export const SECRET_ENV_NAMES: readonly string[] = [
  "GITHUB_TOKEN",
  // BEGIN generated: provider-secrets (regenerate: task generate)
  "OLLAMA_API_KEY",
  "OLLAMA_CLOUD_API_KEY",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "CLOUDFLARE_API_KEY",
  "COHERE_API_KEY",
  "ANTHROPIC_API_KEY",
  "DEEPSEEK_API_KEY",
  "GOOGLE_API_KEY",
  "MISTRAL_API_KEY",
  "MINIMAX_API_KEY",
  "MOONSHOT_API_KEY",
  "NVIDIA_API_KEY",
  "ZAI_API_KEY",
  // END generated: provider-secrets
  "OTEL_EXPORTER_OTLP_HEADERS",
  "MEMORY_TOKEN",
  "MEMORY_DEPLOY_KEY",
] as const;

// Patterns redacted unconditionally, regardless of the heuristics toggle. These
// are reserved for shapes whose false-positive risk is effectively zero and
// whose sensitivity is categorically higher than API tokens. The PEM
// `-----BEGIN ... PRIVATE KEY-----` ... `-----END ... PRIVATE KEY-----` block
// covers RSA, DSA, EC, OpenSSH, PKCS#8, encrypted, and PGP private keys; lazy
// `[\s\S]+?` matches across newlines without spilling into a following block.
const ALWAYS_ON_PATTERNS: readonly string[] = [
  "-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----[\\s\\S]+?-----END [A-Z ]*PRIVATE KEY( BLOCK)?-----",
];

// Common token shapes. Used only when `heuristics: true`.
//
// The JWT pattern matches the three-part `header.payload.signature` structure
// where both header and payload start with `eyJ` (the base64url encoding of
// `{"`, which every JSON-header JWT shares). False-positive risk is effectively
// zero because the doubled `eyJ` prefix plus a dot-separated signature segment
// is too specific to match anything but a real JWT.
const HEURISTIC_PATTERNS: readonly string[] = [
  "github_pat_[A-Za-z0-9_]{82,}",
  "gh[pours]_[A-Za-z0-9]{36,}",
  "AIza[0-9A-Za-z_-]{35}",
  "xox[bpoa]-[A-Za-z0-9-]{20,}",
  "sk-[A-Za-z0-9_-]{20,}",
  "eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]{10,}",
];

const DEFAULT_MIN_LENGTH = 8;
const DEFAULT_PLACEHOLDER = "***";
const REGEX_META = /[.*+?^${}()|[\]\\]/g;

export interface RedactorOptions {
  env?: NodeJS.ProcessEnv;
  heuristics?: boolean;
  placeholder?: string;
  minLength?: number;
}

export interface Redactor {
  redact(input: string): string;
  readonly secretCount: number;
}

export function collectSecretValues(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
  minLength: number = DEFAULT_MIN_LENGTH,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const v = env[name];
    if (typeof v !== "string") continue;
    if (v.trim().length < minLength) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function emitAddMaskDirectives(values: readonly string[]): void {
  const seen = new Set<string>();
  for (const v of values) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    process.stdout.write(`::add-mask::${v}\n`);
  }
}

export function createRedactor(opts: RedactorOptions = {}): Redactor {
  const placeholder = opts.placeholder ?? DEFAULT_PLACEHOLDER;
  const minLength = opts.minLength ?? DEFAULT_MIN_LENGTH;
  const env = opts.env ?? process.env;
  const heuristics = opts.heuristics ?? false;

  const values = collectSecretValues(env, SECRET_ENV_NAMES, minLength);
  values.sort((a, b) => b.length - a.length);

  const alternation: string[] = values.map(escapeRegex);
  alternation.push(...ALWAYS_ON_PATTERNS);
  if (heuristics) alternation.push(...HEURISTIC_PATTERNS);

  const pattern =
    alternation.length > 0 ? new RegExp(alternation.join("|"), "g") : null;

  return {
    secretCount: values.length,
    redact(input: string): string {
      if (!pattern || !input) return input;
      return input.replace(pattern, placeholder);
    },
  };
}

function escapeRegex(s: string): string {
  return s.replace(REGEX_META, "\\$&");
}

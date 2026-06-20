/**
 * redact-patterns — the canonical redaction taxonomy for apa-redact.
 *
 * Single source of truth shared by `redact-engine.mjs`, `cli.mjs`, and the test
 * suite. This is a plain-ESM, zero-dependency Node.js port of gstack's
 * `lib/redact-patterns.ts` (the 3-tier taxonomy), extended with patent-specific
 * categories for the Agent-Native-Patent-Artifact (APA) project.
 *
 * Design notes (ported from gstack, locked in /plan-eng-review + two Codex passes):
 *
 *   - Three tiers. HIGH = genuinely-secret credentials (BLOCK). MEDIUM = PII,
 *     legal/damaging, internal-leak, plus credential-shaped patterns that have
 *     high false-positive rates (CONFIRM via a prompt/asker). LOW = surface only.
 *   - NO wholesale MEDIUM->HIGH promotion on public repos. Public repos get
 *     sterner per-finding confirmation, not auto-block. The engine never mutates
 *     a finding's tier based on visibility.
 *   - Tier-1 calibration: a gate that cries wolf gets ignored. Stripe publishable
 *     keys, Google AIza keys, JWTs, and env-style KV are MEDIUM, not HIGH (they
 *     are context-variable / high-FP). Only genuinely-secret credentials block.
 *   - ReDoS safety: every pattern here is meant to be linear-time (no nested
 *     unbounded quantifiers). The engine also enforces a hard input-size cap that
 *     fails CLOSED.
 *   - Placeholder suppression is per-matched-span, not per-line.
 *
 * Patent extensions (APA-specific, calibrated to the same philosophy):
 *
 *   - HIGH: unpublished US application / serial numbers in a confidential context
 *     (a public emission of an unfiled serial is a genuine confidentiality
 *     breach), and inventor SSN (genuine PII secret).
 *   - MEDIUM: CONFIDENTIAL / DO NOT FILE / NDA markers (extends gstack's
 *     legal.nda_marker), employer trade-secret codenames, public-disclosure /
 *     bar-date risk phrases ("shipped to customer", "offered for sale",
 *     "published on", ...), and inventor PII (names+addresses near "inventor").
 *
 * Pattern matching contract: every `regex` is `.source` only (NO inline `g`/`m`
 * flags). The engine recompiles each with the `gm` flags it needs. Capture group
 * 1, when present, is the "secret span" the engine masks and (for proximity
 * rules) anchors on; when absent, `match[0]` is the span. A pattern that needs
 * case-insensitivity carries it via the `ignoreCase` field (the engine ORs that
 * into the recompiled flags), NOT via a baked-in `i` flag on the literal.
 *
 * NOTE ON "confirms vs blocks": a pattern's `tier` IS its disposition, exposed as
 * the `action` field. HIGH -> 'block' (exit 3). MEDIUM -> 'confirm' (exit 2).
 * LOW -> 'fyi' (does not gate the exit code).
 *
 * Node.js >=18, ES module, zero dependencies.
 */

// ── Tier -> action map ────────────────────────────────────────────────────────

/** @typedef {"HIGH"|"MEDIUM"|"LOW"} Tier */
/** @typedef {"secret"|"pii"|"legal"|"internal"|"hygiene"|"patent"} Category */
/** @typedef {"block"|"confirm"|"fyi"} Action */

/** HIGH blocks, MEDIUM confirms, LOW is FYI. */
export function actionForTier(tier) {
  if (tier === "HIGH") return "block";
  if (tier === "MEDIUM") return "confirm";
  return "fyi";
}

// ── Validators ────────────────────────────────────────────────────────────────

/** Luhn checksum — credit-card validity. Strips spaces/dashes first. */
export function luhnValid(span) {
  const digits = span.replace(/[ \-]/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Shannon entropy in bits/char. Gates env-style KV (skip placeholders). */
export function shannonEntropy(s) {
  if (!s.length) return 0;
  /** @type {Record<string, number>} */
  const freq = {};
  for (const ch of s) freq[ch] = (freq[ch] || 0) + 1;
  let h = 0;
  const n = s.length;
  for (const ch in freq) {
    const p = freq[ch] / n;
    h -= p * Math.log2(p);
  }
  return h;
}

/** True when an IPv4 string is a public address (not RFC1918/loopback/etc). */
export function isPublicIPv4(ip) {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o = m.slice(1, 5).map(Number);
  if (o.some((n) => n > 255)) return false;
  const [a, b] = o;
  if (a === 10) return false; // 10.0.0.0/8
  if (a === 127) return false; // loopback
  if (a === 0) return false; // this-network
  if (a === 192 && b === 168) return false; // 192.168.0.0/16
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64.0.0/10
  if (a >= 224) return false; // multicast / reserved
  return true;
}

// EIP-55 checksum is out of scope (heavy); we require a length+charset match and
// reject all-same-char vanity strings to cut the worst FPs.
function looksLikeWallet(span) {
  if (/^0x[a-fA-F0-9]{40}$/.test(span)) {
    const body = span.slice(2).toLowerCase();
    return !/^(.)\1{39}$/.test(body); // reject 0x000...0 / 0xfff...f
  }
  // bech32 / base58 — length sanity only.
  return span.length >= 26 && span.length <= 62;
}

// ── Placeholder suppression (per-matched-span, NOT per-line) ──────────────────

// Structural placeholder forms — apply to ANY span (including URLs).
const PLACEHOLDER_STRUCTURAL = [
  /^your[_-]/i,
  /^<[^>]*>$/, // <REDACTED-FOO>, <your-key>
  /^\*+$/, // all-asterisks mask
  /^x{6,}$/i, // xxxxxx mask
];

// Substring placeholder words (example/test/dummy/...). NOT applied to compound
// spans containing "://" or "@", because a legit URL/host can contain "example"
// (e.g. db.example.com) without being a placeholder secret. AWS docs keys like
// AKIAIOSFODNN7EXAMPLE are bare tokens, so the guard still catches them.
const PLACEHOLDER_SUBSTRING = [
  /example/i, // AKIAIOSFODNN7EXAMPLE etc — AWS docs convention
  /^changeme$/i,
  /^redacted/i,
  /^placeholder/i,
  /^dummy/i,
  /^fake/i,
  /test[_-]?(key|token|secret)/i,
];

/**
 * A finding is suppressed only if the MATCHED SPAN itself is a placeholder form
 * — not merely co-located on a line with the word EXAMPLE.
 */
export function isPlaceholderSpan(span) {
  if (PLACEHOLDER_STRUCTURAL.some((re) => re.test(span))) return true;
  const isCompound = span.includes("://") || span.includes("@");
  if (!isCompound && PLACEHOLDER_SUBSTRING.some((re) => re.test(span))) return true;
  return false;
}

// ── Validator closures for the taxonomy below ─────────────────────────────────

function validateUrlPassword(span) {
  const m = span.match(/:\/\/[^:]+:([^@]+)@/);
  const pw = m ? m[1] : "";
  return pw !== "" && !isPlaceholderSpan(pw) && !/^\$\{?[A-Z_]+\}?$/.test(pw);
}

function validateEnvKv(span) {
  return (
    !isPlaceholderSpan(span) &&
    !/^\$\{?[A-Za-z_]/.test(span) &&
    shannonEntropy(span) >= 3.0
  );
}

function validateSsn(span) {
  const [a, b, c] = span.split("-");
  return a !== "000" && b !== "00" && c !== "0000" && a !== "666" && a[0] !== "9";
}

// ── The taxonomy ──────────────────────────────────────────────────────────────
//
// Each entry: { name, tier, category, description, regex, action, ... }
//   - `name` is the stable dotted id used in findings + tests.
//   - `action` is derived from tier (block|confirm|fyi) — kept explicit so
//     callers don't re-derive it.
//   - `regex` is a RegExp WITHOUT g/m flags; the engine recompiles with `gm`.
//   - `ignoreCase: true` makes the engine OR an `i` into the recompiled flags.

/** @type {Array<{
 *   name: string, tier: Tier, category: Category, description: string,
 *   regex: RegExp, action: Action, ignoreCase?: boolean,
 *   autoRedactable?: boolean, redactToken?: string,
 *   validate?: (span: string) => boolean,
 *   nearRegex?: RegExp, nearWindow?: number,
 * }>} */
const RAW_PATTERNS = [
  // ===== HIGH — genuinely-secret credentials (block) =====
  {
    name: "aws.access_key",
    tier: "HIGH",
    category: "secret",
    description: "AWS access key ID (AKIA…)",
    regex: /\b(AKIA[0-9A-Z]{16})\b/,
  },
  {
    name: "aws.secret_key",
    tier: "HIGH",
    category: "secret",
    description: "AWS secret access key (with aws_secret_access_key nearby)",
    regex: /\b([A-Za-z0-9/+=]{40})\b/,
    nearRegex: /aws.{0,3}secret.{0,3}access.{0,3}key/i,
    nearWindow: 100,
  },
  {
    name: "github.pat",
    tier: "HIGH",
    category: "secret",
    description: "GitHub personal access token (classic)",
    regex: /\b(ghp_[A-Za-z0-9]{36})\b/,
  },
  {
    name: "github.oauth",
    tier: "HIGH",
    category: "secret",
    description: "GitHub OAuth token",
    regex: /\b(gho_[A-Za-z0-9]{36})\b/,
  },
  {
    name: "github.server",
    tier: "HIGH",
    category: "secret",
    description: "GitHub server-to-server token",
    regex: /\b(ghs_[A-Za-z0-9]{36})\b/,
  },
  {
    name: "github.fine_grained",
    tier: "HIGH",
    category: "secret",
    description: "GitHub fine-grained PAT",
    regex: /\b(github_pat_[A-Za-z0-9_]{82})\b/,
  },
  {
    name: "anthropic.key",
    tier: "HIGH",
    category: "secret",
    description: "Anthropic API key",
    regex: /\b(sk-ant-[A-Za-z0-9_\-]{20,})\b/,
  },
  {
    name: "openai.key",
    tier: "HIGH",
    category: "secret",
    description: "OpenAI API key (incl. sk-proj-/sk-svcacct-/sk-admin-)",
    // Two explicit shapes:
    //   prefixed: sk-{proj,svcacct,admin}- + base64url-ish body (allows -_)
    //   bare:     sk- + contiguous alphanumeric run (legacy), {32,} floor
    regex: /\b(sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,})\b/,
  },
  {
    name: "sendgrid.key",
    tier: "HIGH",
    category: "secret",
    description: "SendGrid API key",
    regex: /\b(SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43})\b/,
  },
  {
    name: "stripe.secret",
    tier: "HIGH",
    category: "secret",
    description: "Stripe live SECRET key",
    regex: /\b(sk_live_[A-Za-z0-9]{24,})\b/,
  },
  {
    name: "slack.token",
    tier: "HIGH",
    category: "secret",
    description: "Slack token (bot/user/app)",
    regex: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/,
  },
  {
    name: "slack.webhook",
    tier: "HIGH",
    category: "secret",
    description: "Slack incoming webhook URL",
    regex: /(https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{24})/,
  },
  {
    name: "discord.webhook",
    tier: "HIGH",
    category: "secret",
    description: "Discord webhook URL",
    regex: /(https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/[0-9]{17,20}\/[A-Za-z0-9_\-]{60,})/,
  },
  {
    name: "twilio.auth_token",
    tier: "HIGH",
    category: "secret",
    description: "Twilio auth token (32 hex, with an Account SID nearby)",
    regex: /\b([a-f0-9]{32})\b/,
    nearRegex: /\bAC[a-f0-9]{32}\b/,
    nearWindow: 200,
  },
  {
    name: "pem.private_key",
    tier: "HIGH",
    category: "secret",
    description: "PEM private key block",
    regex: /(-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----)/,
  },
  {
    name: "db.url_with_password",
    tier: "HIGH",
    category: "secret",
    description: "Database URL with embedded password",
    regex: /\b((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:\s/@]+:[^@\s/]+@[^\s/]+)/,
    validate: validateUrlPassword,
  },
  {
    name: "creds.basic_auth_url",
    tier: "HIGH",
    category: "secret",
    description: "HTTP(S) URL with embedded basic-auth credentials",
    regex: /(https?:\/\/[^:\s/@]+:[^@\s/]+@[^\s/]+)/,
    validate: validateUrlPassword,
  },

  // ===== HIGH — PATENT extensions =====
  {
    name: "patent.unpublished_serial",
    tier: "HIGH",
    category: "patent",
    description:
      "Unpublished US application/serial number in a confidential context " +
      "(e.g. 18/123,456 near CONFIDENTIAL/unpublished/do-not-file)",
    // US serial number shape: two-digit series code + slash + six digits,
    // optional comma grouping (18/123,456 or 18/123456).
    regex: /\b(\d{2}\/\d{3},?\d{3})\b/,
    // Only HIGH when it sits in a confidential / not-yet-public context; a
    // published patent number on a public page is not a leak.
    nearRegex:
      /(confidential|unpublished|not[ \-]?yet[ \-]?published|do[ \-]?not[ \-]?file|under[ \-]?nda|serial[ \-]?(no|number)|application[ \-]?(no|number)|draft|unfiled)/i,
    nearWindow: 120,
  },
  {
    name: "patent.inventor_ssn",
    tier: "HIGH",
    category: "patent",
    description: "Inventor SSN (US Social Security Number, genuine PII secret)",
    regex: /\b(\d{3}-\d{2}-\d{4})\b/,
    validate: validateSsn,
  },

  // ===== MEDIUM — demoted credential-shaped (high-FP / context-variable) =====
  {
    name: "stripe.publishable",
    tier: "MEDIUM",
    category: "secret",
    description: "Stripe live publishable key (often intentionally public)",
    regex: /\b(pk_live_[A-Za-z0-9]{24,})\b/,
  },
  {
    name: "google.api_key",
    tier: "MEDIUM",
    category: "secret",
    description: "Google API key (AIza…; sometimes a public client key)",
    regex: /\b(AIza[0-9A-Za-z\-_]{35})\b/,
  },
  {
    name: "jwt",
    tier: "MEDIUM",
    category: "secret",
    description: "JSON Web Token (3-segment base64url)",
    regex: /\b(eyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,})\b/,
  },
  {
    name: "env.kv",
    tier: "MEDIUM",
    category: "secret",
    description: "Env-style SECRET assignment with high-entropy value",
    regex:
      /^[ \t]*(?:export[ \t]+)?[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?|DSN|AUTH|COOKIE|SESSION|PRIVATE)[ \t]*=[ \t]*['"]?([^\s'"]{8,})['"]?/,
    validate: validateEnvKv,
  },

  // ===== MEDIUM — PII (auto-redactable subset) =====
  {
    name: "pii.email",
    tier: "MEDIUM",
    category: "pii",
    description: "Email address",
    regex: /\b([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b/,
    autoRedactable: true,
    redactToken: "<REDACTED-EMAIL>",
    // Engine layers the email allowlist (example.com, noreply@, user's own,
    // repo-public authors) on top of this — see redact-engine.mjs.
  },
  {
    name: "pii.phone.e164",
    tier: "MEDIUM",
    category: "pii",
    description: "Phone number (E.164 / common national formats; US/EU-biased)",
    regex: /(?<![\w.])(\+?[1-9]\d{0,2}[ \-.]?\(?\d{2,4}\)?[ \-.]?\d{3,4}[ \-.]?\d{3,4})(?![\w.])/,
    autoRedactable: true,
    redactToken: "<REDACTED-PHONE>",
    validate: (span) => span.replace(/\D/g, "").length >= 10,
  },
  {
    name: "pii.ssn",
    tier: "MEDIUM",
    category: "pii",
    description: "US Social Security Number",
    regex: /\b(\d{3}-\d{2}-\d{4})\b/,
    autoRedactable: true,
    redactToken: "<REDACTED-SSN>",
    validate: validateSsn,
  },
  {
    name: "pii.cc",
    tier: "MEDIUM",
    category: "pii",
    description: "Credit-card number (Luhn-valid)",
    // End the match on a DIGIT (…{12,18}\d = 13-19 digits) so a trailing separator after the last digit
    // is NOT captured into the span; otherwise applyRedactions splices it out too and merges the token
    // with the following word ("card 4111… here" -> "card <REDACTED-CC>here").
    regex: /\b((?:\d[ \-]?){12,18}\d)\b/,
    autoRedactable: true,
    redactToken: "<REDACTED-CC>",
    validate: luhnValid,
  },
  {
    name: "pii.ip_public",
    tier: "MEDIUM",
    category: "pii",
    description: "Public IPv4 address",
    regex: /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/,
    validate: isPublicIPv4,
  },
  {
    name: "pii.wallet",
    tier: "MEDIUM",
    category: "pii",
    description: "Crypto wallet address (ETH/BTC)",
    regex: /\b(0x[a-fA-F0-9]{40}|bc1[a-z0-9]{25,39}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/,
    validate: looksLikeWallet,
  },

  // ===== MEDIUM — internal-leak =====
  {
    name: "internal.hostname",
    tier: "MEDIUM",
    category: "internal",
    description: "Internal hostname (*.internal/.corp/.local/.prod/.staging)",
    regex: /\b([a-z0-9][a-z0-9\-]*\.(?:internal|corp|local|lan|prod|staging))\b/,
    ignoreCase: true,
  },
  {
    name: "internal.url_private",
    tier: "MEDIUM",
    category: "internal",
    description: "localhost URL with a non-trivial path",
    regex: /(https?:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}\/[^\s)]+)/,
  },

  // ===== MEDIUM — legal / damaging =====
  {
    name: "legal.nda_marker",
    tier: "MEDIUM",
    category: "legal",
    description: "Confidentiality / NDA / do-not-file marker",
    // Extends gstack's legal.nda_marker with patent-specific DO NOT FILE, NDA,
    // and DRAFT CLAIMS markers.
    regex:
      /\b(CONFIDENTIAL|UNDER NDA|NDA|ATTORNEY[- ]CLIENT|PRIVILEGED|DO NOT DISTRIBUTE|DO NOT FILE|EYES ONLY|DRAFT CLAIMS?)\b/,
  },
  {
    name: "legal.named_criticism",
    tier: "MEDIUM",
    category: "legal",
    description: "Negative judgment near a capitalized full name",
    regex:
      /\b(incompetent|negligent|fraudulent|fraud|fired|terminated|harassed|underperforming)\b/,
    ignoreCase: true,
    nearRegex: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/,
    nearWindow: 80,
  },

  // ===== MEDIUM — PATENT extensions =====
  {
    name: "patent.trade_secret_codename",
    tier: "MEDIUM",
    category: "patent",
    description: "Employer trade-secret codename (Project/Codename <NAME>)",
    // Internal program codenames: "Project Foo", "Codename: Bar",
    // "CODENAME BAZ" — a common way trade-secret programs are referenced.
    regex: /\b((?:Project|Codename|Code[- ]?name|Program)[ :]+[A-Z][A-Za-z0-9_\-]{2,})\b/,
  },
  {
    name: "patent.public_disclosure_phrase",
    tier: "MEDIUM",
    category: "patent",
    description: "Public-disclosure / bar-date risk phrase (on-sale or public-use bar)",
    // 35 U.S.C. 102 bar triggers: offer for sale, public use, printed
    // publication. Surfacing these in an outbound payload risks admitting a
    // statutory bar; flag for human review.
    regex:
      /\b(shipped to (?:a |the )?customer|demoed publicly|public(?:ly)? demo(?:ed|nstrated)?|offered for sale|on sale|for sale to|published on|publicly disclosed|public disclosure|presented at (?:the )?conference|sold to (?:a |the )?customer)\b/,
    ignoreCase: true,
  },
  {
    name: "patent.inventor_pii",
    tier: "MEDIUM",
    category: "patent",
    description: "Inventor name + street address near the word 'inventor'",
    // A capitalized full name followed (within the line) by a US street address,
    // anchored on the word "inventor" nearby. Catches the common ADS/declaration
    // leak of an inventor's home address.
    regex:
      /\b([A-Z][a-z]+ [A-Z][a-z]+,?\s+\d{1,5}\s+[A-Z][A-Za-z0-9.\- ]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way))\b/,
    nearRegex: /\binventor/i,
    nearWindow: 120,
  },

  // ===== LOW — surface only =====
  {
    name: "internal.user_path",
    tier: "LOW",
    category: "internal",
    description: "Absolute path under a user home dir",
    regex: /(\/(?:Users|home)\/[a-z][a-z0-9_\-]+\/[^\s)]*)/,
  },
  {
    name: "hygiene.todo",
    tier: "LOW",
    category: "hygiene",
    description: "TODO(owner) marker carried into the artifact",
    regex: /\b(TODO\([^)]+\))/,
  },
];

/**
 * The exported taxonomy. Each pattern carries its derived `action` so callers
 * don't re-derive it from the tier.
 */
export const PATTERNS = RAW_PATTERNS.map((p) => ({
  ...p,
  action: actionForTier(p.tier),
}));

/** Lookup by name. */
export const PATTERNS_BY_NAME = Object.fromEntries(PATTERNS.map((p) => [p.name, p]));

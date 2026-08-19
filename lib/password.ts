import zxcvbn from "zxcvbn";

export type PasswordCheck = {
  score: number; // 0-4 from zxcvbn
  label: "Very weak" | "Weak" | "Fair" | "Strong" | "Excellent";
  errors: string[];
  ok: boolean;
};

const SEQUENTIAL_RUNS = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm"];

function hasSequentialRun(lower: string, len = 4): boolean {
  for (const run of SEQUENTIAL_RUNS) {
    for (let i = 0; i <= run.length - len; i++) {
      if (lower.includes(run.slice(i, i + len))) return true;
    }
  }
  return false;
}

function hasRepeatedRun(lower: string, len = 4): boolean {
  for (let i = 0; i <= lower.length - len; i++) {
    if (new Set(lower.slice(i, i + len)).size === 1) return true;
  }
  return false;
}

/**
 * "Sundar Test" as a whole string only blocks a password containing the
 * literal substring "sundar test" — a password reusing just "Sundar" slips
 * through a naive whole-string check. Split every personal value into its
 * individual words (and an email's local-part into its own sub-tokens on
 * `.`/`_`/`-`/`+`) so each one is checked on its own. Must stay identical to
 * the backend's derivePersonalTokens (common/utils/password.js) — this is
 * the client-side preview of what the server will actually enforce.
 */
function derivePersonalTokens(values: Array<string | undefined | null>): string[] {
  const tokens: string[] = [];
  for (const raw of values) {
    if (!raw) continue;
    const base = raw.includes("@") ? raw.split("@")[0] : raw;
    for (const token of base.split(/[\s._\-+]+/)) {
      if (token.length >= 3) tokens.push(token);
    }
  }
  return tokens;
}

/** Mirrors the policy documented in the platform blueprint §05 — length, character classes, entropy score, personal-info reuse. */
export function checkPasswordStrength(
  password: string,
  personal: Array<string | undefined | null> = []
): PasswordCheck {
  const errors: string[] = [];
  const lower = password.toLowerCase();
  const personalTerms = derivePersonalTokens(personal);

  if (password.length < 12) errors.push("At least 12 characters");
  if (!/[A-Z]/.test(password)) errors.push("One uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("One lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("One number");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("One special character");

  const personalHits = personalTerms.some((v) => lower.includes(v.toLowerCase()));
  if (personalHits) errors.push("Can't contain your name, email or mobile number");

  if (hasSequentialRun(lower) || hasRepeatedRun(lower)) {
    errors.push("No sequential or repeated runs (e.g. 1234, aaaa)");
  }

  const { score } = password.length ? zxcvbn(password, personalTerms) : { score: 0 };
  if (password.length >= 12 && score < 3) {
    errors.push("This is too easy to guess — try something longer and less predictable");
  }

  const labels: PasswordCheck["label"][] = ["Very weak", "Weak", "Fair", "Strong", "Excellent"];

  return {
    score,
    label: labels[score] ?? "Very weak",
    errors,
    ok: errors.length === 0 && password.length > 0,
  };
}

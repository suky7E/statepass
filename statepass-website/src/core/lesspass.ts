/**
 * lesspass.ts — Main orchestrator for password and passphrase generation (StatePass).
 */

import { calcEntropy, DEFAULT_ITERATIONS, DEFAULT_KEYLEN } from './entropy';
import { renderPassword, RenderProfile } from './renderer';
import { createPassphrase } from './passphrase';

export { DEFAULT_ITERATIONS };

export interface LessPassProfile {
  site: string;
  login: string;
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  counter: number;
  iterations: number;
  wordCount?: number;
  separator?: string;
}

export const DEFAULT_PROFILE: LessPassProfile = {
  site:       '',
  login:      '',
  length:     16,
  lowercase:  true,
  uppercase:  true,
  digits:     true,
  symbols:    true,
  counter:    1,
  iterations: DEFAULT_ITERATIONS,
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateProfile(profile: LessPassProfile) {
  if (!Number.isInteger(profile.counter) || profile.counter < 1) {
    throw new Error('Counter must be a positive integer (≥ 1).');
  }

  const enabledRules = (['lowercase', 'uppercase', 'digits', 'symbols'] as const).filter(
    r => profile[r]
  );
  if (enabledRules.length === 0) {
    throw new Error('At least one character set must be enabled.');
  }

  if (!Number.isInteger(profile.length) || profile.length < enabledRules.length) {
    throw new Error(
      `Password length must be at least ${enabledRules.length} to satisfy all enabled character rules.`,
    );
  }

  if (!Number.isInteger(profile.iterations) || profile.iterations < 10_000) {
    throw new Error('Iterations must be an integer ≥ 10,000.');
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generatePassword(masterPassword: string, profile: Partial<LessPassProfile> = {}): Promise<string> {
  const p = { ...DEFAULT_PROFILE, ...profile };
  validateProfile(p);

  const entropy = await calcEntropy(
    p.site, p.login, masterPassword,
    p.counter, p.iterations,
  );

  return renderPassword(entropy, p as RenderProfile);
}

export async function generatePassphrase(masterPassword: string, profile: Partial<LessPassProfile> = {}): Promise<string> {
  const p = {
    ...DEFAULT_PROFILE,
    wordCount: 6,
    separator: '-',
    ...profile,
  };

  if (!Number.isInteger(p.counter) || p.counter < 1) {
    throw new Error('Counter must be a positive integer (≥ 1).');
  }

  const entropy = await calcEntropy(
    p.site, p.login, masterPassword,
    p.counter, p.iterations,
  );

  return createPassphrase(entropy, p.wordCount, p.separator);
}

export interface StrengthEstimate {
  score: number;
  label: string;
  bits: number;
}

/**
 * Report strength based on the entropy derivation.
 */
export function estimateStrength(password: string): StrengthEstimate {
  let poolSize = 0;
  if (/[a-z]/.test(password))       poolSize += 26;
  if (/[A-Z]/.test(password))       poolSize += 26;
  if (/[0-9]/.test(password))       poolSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) poolSize += 33;

  const charBits   = poolSize > 0 ? Math.log2(poolSize) * password.length : 0;
  const bits       = Math.round(Math.min(charBits, DEFAULT_KEYLEN * 8));

  if (bits < 40)  return { score: 0, label: 'Very Weak',   bits };
  if (bits < 60)  return { score: 1, label: 'Weak',        bits };
  if (bits < 80)  return { score: 2, label: 'Fair',        bits };
  if (bits < 100) return { score: 3, label: 'Strong',      bits };
  return           { score: 4, label: 'Very Strong',       bits };
}

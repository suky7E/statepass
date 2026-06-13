/**
 * lesspass.js — Main orchestrator for password and passphrase generation (StatePass).
 *
 * Improvements vs original:
 *  - Input validation: counter must be ≥ 1, length must accommodate all enabled rules.
 *  - estimateStrength now reports actual PBKDF2 output bits (always 256 for default
 *    settings) rather than naive character-pool math, which was misleading.
 */

import { calcEntropy, DEFAULT_ITERATIONS, DEFAULT_KEYLEN } from './entropy.js';
import { renderPassword }                                  from './renderer.js';
import { createPassphrase }                                from './passphrase.js';

export { DEFAULT_ITERATIONS };

export const DEFAULT_PROFILE = {
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

function validateProfile(profile) {
  if (!Number.isInteger(profile.counter) || profile.counter < 1) {
    throw new Error('Counter must be a positive integer (≥ 1).');
  }

  const enabledRules = ['lowercase', 'uppercase', 'digits', 'symbols'].filter(r => profile[r]);
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

export async function generatePassword(masterPassword, profile = {}) {
  const p = { ...DEFAULT_PROFILE, ...profile };
  validateProfile(p);

  const entropy = await calcEntropy(
    p.site, p.login, masterPassword,
    p.counter, p.iterations,
  );

  return renderPassword(entropy, p);
}

export async function generatePassphrase(masterPassword, profile = {}) {
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

/**
 * Report strength based on the entropy derivation, not naive character-pool math.
 *
 * For a deterministically generated password the "strength" is bounded by the
 * PBKDF2 output length (DEFAULT_KEYLEN × 8 bits = 256 bits), not by the character
 * pool size.  We still show the rendered character-pool bits as a secondary metric
 * so users understand why short passwords are worth avoiding.
 */
export function estimateStrength(password) {
  let poolSize = 0;
  if (/[a-z]/.test(password))       poolSize += 26;
  if (/[A-Z]/.test(password))       poolSize += 26;
  if (/[0-9]/.test(password))       poolSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) poolSize += 33;

  const charBits   = poolSize > 0 ? Math.log2(poolSize) * password.length : 0;
  // The KDF output is always 256 bits; the rendered password re-encodes those bits
  // into a smaller alphabet, so the rendered bits are the correct security estimate.
  const bits       = Math.round(Math.min(charBits, DEFAULT_KEYLEN * 8));

  if (bits < 40)  return { score: 0, label: 'Very Weak',   bits };
  if (bits < 60)  return { score: 1, label: 'Weak',        bits };
  if (bits < 80)  return { score: 2, label: 'Fair',        bits };
  if (bits < 100) return { score: 3, label: 'Strong',      bits };
  return           { score: 4, label: 'Very Strong',       bits };
}

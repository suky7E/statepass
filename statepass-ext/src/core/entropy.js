/**
 * entropy.js — PBKDF2-SHA256 entropy derivation via Web Crypto API
 *
 * Security:
 *  - SHA-256 is hardcoded (SHA-384/512 provide negligible benefit over SHA-256
 *    for PBKDF2; they add complexity and risk of wrong-algo = wrong password)
 *  - Salt uses length-prefixed delimiters to prevent collision attacks
 *    (e.g. site="fo"+login="obar" no longer collides with site="foo"+login="bar")
 *  - Default iterations: 600,000 (OWASP 2023 recommendation for PBKDF2-SHA256)
 *
 * FUTURE (v4.0): Migrate to Argon2id — memory-hard, GPU-resistant KDF.
 *   This is a BREAKING change (all generated passwords will differ).
 *   Requires: argon2-browser WASM, migration notice, kdf field in profile.
 */

export const DEFAULT_ITERATIONS = 600_000;
export const DEFAULT_KEYLEN     = 32;        // 256-bit output

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a collision-resistant salt.
 * Format: "<siteLen>:<site>|<loginLen>:<login>|<counterHex>"
 * The length prefix ensures no two (site, login) pairs map to the same salt.
 */
function buildSalt(site, login, counter) {
  return `${site.length}:${site}|${login.length}:${login}|${counter.toString(16)}`;
}

function hexEncode(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive entropy from (site, login, masterPassword, counter) using PBKDF2.
 * Returns a hex-encoded string of `keylen` bytes.
 */
export async function calcEntropy(
  site,
  login,
  masterPassword,
  counter    = 1,
  iterations = DEFAULT_ITERATIONS,
  keylen     = DEFAULT_KEYLEN,
) {
  const encoder     = new TextEncoder();
  const salt        = buildSalt(site, login, counter);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const entropy = await crypto.subtle.deriveBits(
    {
      name:       'PBKDF2',
      salt:       encoder.encode(salt),
      iterations,
      hash:       'SHA-256',
    },
    keyMaterial,
    keylen * 8,
  );

  return hexEncode(entropy);
}

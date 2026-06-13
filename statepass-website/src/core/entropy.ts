/**
 * entropy.ts — PBKDF2-SHA256 entropy derivation via Web Crypto API.
 */

export const DEFAULT_ITERATIONS = 600_000;
export const DEFAULT_KEYLEN     = 32;        // 256-bit output

/**
 * Build a collision-resistant salt.
 * Format: "<siteLen>:<site>|<loginLen>:<login>|<counterHex>"
 */
function buildSalt(site: string, login: string, counter: number): string {
  return `${site.length}:${site}|${login.length}:${login}|${counter.toString(16)}`;
}

function hexEncode(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive entropy from (site, login, masterPassword, counter) using PBKDF2.
 * Returns a hex-encoded string of `keylen` bytes.
 */
export async function calcEntropy(
  site: string,
  login: string,
  masterPassword: string,
  counter: number = 1,
  iterations: number = DEFAULT_ITERATIONS,
  keylen: number = DEFAULT_KEYLEN,
): Promise<string> {
  const encoder     = new TextEncoder();
  const salt        = buildSalt(site, login, counter);

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(masterPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const entropy = await window.crypto.subtle.deriveBits(
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

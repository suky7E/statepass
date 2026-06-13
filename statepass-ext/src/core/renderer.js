/**
 * renderer.js — Convert entropy hex into a rendered password.
 *
 * Algorithm:
 *  1. Treat entropy as a big integer.
 *  2. Consume (length - ruleCount) characters from the full charset via repeated
 *     modulo division.
 *  3. Pick exactly one character from each enabled rule's charset.
 *  4. Insert the rule-guarantee characters pseudo-randomly using remaining entropy.
 *
 * This guarantees that the password always satisfies the selected character rules
 * while keeping output deterministic for given inputs.
 */

export const CHARACTER_SUBSETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits:    '0123456789',
  symbols:   '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
};

const ALL_RULES = ['lowercase', 'uppercase', 'digits', 'symbols'];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getSetOfCharacters(rules) {
  if (!rules || rules.length === 0) {
    return ALL_RULES.map(r => CHARACTER_SUBSETS[r]).join('');
  }
  return rules.map(r => CHARACTER_SUBSETS[r]).join('');
}

function consumeEntropy(quotient, setOfCharacters, maxLength) {
  let password = '';
  let q = quotient;
  for (let i = 0; i < maxLength; i++) {
    const remainder = q % BigInt(setOfCharacters.length);
    q = q / BigInt(setOfCharacters.length);
    password += setOfCharacters[Number(remainder)];
  }
  return [password, q];
}

function getOneCharPerRule(entropy, rules) {
  let e = entropy;
  let chars = '';
  for (const rule of rules) {
    const charset   = CHARACTER_SUBSETS[rule];
    const remainder = e % BigInt(charset.length);
    e = e / BigInt(charset.length);
    chars += charset[Number(remainder)];
  }
  return [chars, e];
}

function insertStringPseudoRandomly(password, entropy, string) {
  let result = password;
  let e = entropy;
  for (const char of string) {
    const pos = e % BigInt(result.length + 1);
    e = e / BigInt(result.length + 1);
    result = result.slice(0, Number(pos)) + char + result.slice(Number(pos));
  }
  return result;
}

export function getConfiguredRules(profile) {
  return ALL_RULES.filter(r => profile[r]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a password from an entropy hex string and a profile.
 * Throws if profile.length < number of enabled rules (impossible to satisfy constraints).
 */
export function renderPassword(entropyHex, profile) {
  const rules = getConfiguredRules(profile);

  if (rules.length === 0) {
    throw new Error('At least one character set must be enabled.');
  }
  if (profile.length < rules.length) {
    throw new Error(
      `Password length (${profile.length}) must be at least ${rules.length} ` +
      `to satisfy all enabled character rules.`,
    );
  }

  const setOfChars  = getSetOfCharacters(rules);
  const entropy     = BigInt('0x' + entropyHex);
  const baseLength  = profile.length - rules.length;

  let [password, passwordEntropy] = consumeEntropy(entropy, setOfChars, Math.max(0, baseLength));
  const [charsToAdd, charEntropy] = getOneCharPerRule(passwordEntropy, rules);
  password = insertStringPseudoRandomly(password, charEntropy, charsToAdd);

  return password;
}

/**
 * renderer.ts — Convert entropy hex into a rendered password.
 */

export const CHARACTER_SUBSETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits:    '0123456789',
  symbols:   '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
};

export type RuleName = 'lowercase' | 'uppercase' | 'digits' | 'symbols';

const ALL_RULES: RuleName[] = ['lowercase', 'uppercase', 'digits', 'symbols'];

export interface RenderProfile {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
}

function getSetOfCharacters(rules: RuleName[]): string {
  if (!rules || rules.length === 0) {
    return ALL_RULES.map(r => CHARACTER_SUBSETS[r]).join('');
  }
  return rules.map(r => CHARACTER_SUBSETS[r]).join('');
}

function consumeEntropy(quotient: bigint, setOfCharacters: string, maxLength: number): [string, bigint] {
  let password = '';
  let q = quotient;
  for (let i = 0; i < maxLength; i++) {
    const remainder = q % BigInt(setOfCharacters.length);
    q = q / BigInt(setOfCharacters.length);
    password += setOfCharacters[Number(remainder)];
  }
  return [password, q];
}

function getOneCharPerRule(entropy: bigint, rules: RuleName[]): [string, bigint] {
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

function insertStringPseudoRandomly(password: string, entropy: bigint, stringToInsert: string): string {
  let result = password;
  let e = entropy;
  for (const char of stringToInsert) {
    const pos = e % BigInt(result.length + 1);
    e = e / BigInt(result.length + 1);
    result = result.slice(0, Number(pos)) + char + result.slice(Number(pos));
  }
  return result;
}

export function getConfiguredRules(profile: RenderProfile): RuleName[] {
  return ALL_RULES.filter(r => profile[r]);
}

/**
 * Render a password from an entropy hex string and a profile.
 */
export function renderPassword(entropyHex: string, profile: RenderProfile): string {
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

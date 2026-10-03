/**
 * Phone handling is deterministic code, not LLM work: the model may lose digits.
 * Only Kazakhstani numbers (+7 7xx ...) are reformatted; everything else is left as is.
 */

// +7 / 7 / 8 followed by 10 digits with arbitrary separators.
const KZ_RU = /(?<![\d\w])\+?[78][\s\-.]*\(?\d{3}\)?[\s\-.]*\d{3}[\s\-.]*\d{2}[\s\-.]*\d{2}(?!\d)/g;
// Other international numbers: must start with "+" (and not +7).
const INTL = /(?<![\d\w])\+(?!7)\d{1,3}[\s\-()]*\d[\d\s\-()]{6,12}\d(?!\d)/g;
// 10 digits without country prefix.
const LOCAL10 = /(?<!\d)\d{3}[\s\-.]?\d{3}[\s\-.]?\d{2}[\s\-.]?\d{2}(?!\d)/g;

const digitsOf = (s: string): string => s.replace(/\D/g, '');

/** Any Kazakhstani format -> "87073613176" (11 digits, leading 8); null if not a Kazakhstani number. */
export function normalizeKzPhone(raw: string): string | null {
  const d = digitsOf(raw);
  if (d.length !== 11 || (d[0] !== '7' && d[0] !== '8')) return null;
  const area = d.slice(1, 4);
  // All Kazakhstani area/operator codes start with 7 (Russian numbers use 3,4,8,9).
  if (!area.startsWith('7')) return null;
  return `8${d.slice(1)}`;
}

// Kazakhstani mobile prefixes, used for numbers written without the leading 7/8.
const KZ_MOBILE_PREFIXES = new Set(['700', '701', '702', '703', '704', '705', '706', '707', '708', '747', '771', '775', '776', '777', '778']);

/** Reformat every Kazakhstani number inside the text; foreign numbers stay untouched. */
export function normalizePhonesInText(text: string): string {
  return text
    .replace(KZ_RU, (m) => normalizeKzPhone(m) ?? m)
    .replace(LOCAL10, (m) => {
      const d = digitsOf(m);
      return KZ_MOBILE_PREFIXES.has(d.slice(0, 3)) ? `8${d}` : m;
    });
}

/** Text with every phone-like number removed (for comparing the remaining numbers). */
export function stripPhones(text: string): string {
  return [KZ_RU, INTL, LOCAL10].reduce((acc, re) => acc.replace(re, ' '), text);
}

function canonical(digits: string): string {
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

/**
 * Canonical digit keys of every phone-like number in the text.
 * Used to verify the AI neither dropped nor invented a number.
 */
export function extractPhoneKeys(text: string): string[] {
  const keys: string[] = [];
  let rest = text;
  for (const re of [KZ_RU, INTL, LOCAL10]) {
    rest = rest.replace(re, (m) => {
      keys.push(canonical(digitsOf(m)));
      return ' ';
    });
  }
  return keys;
}

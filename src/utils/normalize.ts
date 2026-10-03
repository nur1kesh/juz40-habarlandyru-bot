import { createHash } from 'node:crypto';
import { extractPhoneKeys, normalizePhonesInText } from './phone';

/**
 * Text normalised for duplicate comparison: case, punctuation, emoji, spacing
 * and phone formats are ignored.
 */
export function normalizeForHash(text: string): string {
  const withPhones = normalizePhonesInText(text.normalize('NFKC'));
  const phoneKeys = extractPhoneKeys(withPhones).join('|');
  const letters = withPhones.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return `${letters}#${phoneKeys}`;
}

export function hashText(text: string): string {
  return createHash('sha256').update(normalizeForHash(text)).digest('hex');
}

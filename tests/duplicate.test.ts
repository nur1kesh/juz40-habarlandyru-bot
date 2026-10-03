import { describe, expect, it } from 'vitest';
import { hashText, normalizeForHash } from '../src/utils/normalize';
import { housingFixture, ticketsFixture } from './fixtures/announcements';

describe('duplicate detection (normalized text + hash)', () => {
  it('ignores case, spacing, punctuation and emoji', () => {
    const a = 'КН концертіне билет бар! Бағасын келісуге болады 🎫';
    const b = '  кн   концертіне билет бар, бағасын келісуге болады.';
    expect(hashText(a)).toBe(hashText(b));
  });

  it('ignores phone formatting', () => {
    expect(hashText('Билет бар. 87073613176')).toBe(hashText('Билет бар. +7 707 361 31 76'));
  });

  it('treats different announcements as different', () => {
    expect(hashText(ticketsFixture.original)).not.toBe(hashText(housingFixture.original));
  });

  it('treats a changed phone number as a different announcement', () => {
    expect(hashText('Билет бар. 87073613176')).not.toBe(hashText('Билет бар. 87073613177'));
  });

  it('produces a stable sha256 hex', () => {
    expect(hashText('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(normalizeForHash('A b-C')).toBe('abc#');
  });
});

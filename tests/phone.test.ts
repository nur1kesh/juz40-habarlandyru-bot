import { describe, expect, it } from 'vitest';
import { extractPhoneKeys, normalizeKzPhone, normalizePhonesInText } from '../src/utils/phone';
import { housingFixture } from './fixtures/announcements';

describe('normalizeKzPhone', () => {
  it.each([
    ['87073613176', '87073613176'],
    ['+77073613176', '87073613176'],
    ['8 (707) 361-31-76', '87073613176'],
    ['+7 705 359 8811', '87053598811'],
    ['7 777 111 22 33', '87771112233'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeKzPhone(input)).toBe(expected);
  });

  it('does not touch non-Kazakhstani numbers', () => {
    expect(normalizeKzPhone('89161234567')).toBeNull(); // Russian mobile (9xx)
    expect(normalizeKzPhone('+905551234567')).toBeNull(); // Turkey
    expect(normalizeKzPhone('12345')).toBeNull();
  });
});

describe('normalizePhonesInText', () => {
  it('reformats the number inside the announcement', () => {
    expect(normalizePhonesInText(housingFixture.original)).toContain('Байланысу үшін: 87073613176');
  });

  it('keeps foreign numbers and other digits as they are', () => {
    const text = 'Бағасы 55000 тг, Ресей: 89161234567, Түркия: +90 555 123 45 67';
    expect(normalizePhonesInText(text)).toBe(text);
  });

  it('handles several numbers in one text', () => {
    expect(normalizePhonesInText('+7 705 123 45 67, 8 (707) 361-31-76')).toBe('87051234567, 87073613176');
  });
});

describe('extractPhoneKeys', () => {
  it('gives the same key for different formats of one number', () => {
    expect(extractPhoneKeys('87073613176')).toEqual(extractPhoneKeys('+7 707 361 31 76'));
  });

  it('finds multiple numbers separately', () => {
    expect(extractPhoneKeys('87051234567 87073613176')).toHaveLength(2);
  });

  it('returns nothing for plain prices', () => {
    expect(extractPhoneKeys('Бюджет 55-60к, 150 000 тг')).toEqual([]);
  });
});

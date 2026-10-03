import { describe, expect, it } from 'vitest';
import { applyGuard, applyReviewAll } from '../src/ai/guard';
import { loadConfig } from '../src/config/env';
import { normalizePhonesInText, stripPhones } from '../src/utils/phone';
import { expandLinks } from '../src/utils/sanitize';
import { buildPostHtml } from '../src/utils/telegramFormat';
import { ticketsFixture } from './fixtures/announcements';

const opts = { confidenceThreshold: 0.7 };

describe('phone normalization of numbers without prefix', () => {
  it('converts Kazakhstani mobile numbers written as 10 digits', () => {
    expect(normalizePhonesInText('Номер: 707 361 31 76')).toBe('Номер: 87073613176');
    expect(normalizePhonesInText('7073613176')).toBe('87073613176');
  });

  it('does not touch other 10-digit numbers', () => {
    expect(normalizePhonesInText('Тапсырыс 1234567890')).toBe('Тапсырыс 1234567890');
  });

  it('stripPhones removes numbers but keeps prices', () => {
    expect(stripPhones('Баға 55000 тг, тел 87073613176')).not.toContain('87073613176');
    expect(stripPhones('Баға 55000 тг, тел 87073613176')).toContain('55000');
  });
});

describe('guard: the AI may reformat phone numbers', () => {
  it('does not treat a reformatted number as an invented one', () => {
    const ai = { ...ticketsFixture.ai, cleaned_text: ticketsFixture.ai.cleaned_text.replace('+7 705 359 8811', '87053598811') };
    const r = applyGuard(ticketsFixture.original, ai, opts);
    expect(r.status).toBe('approved');
    expect(r.warnings).not.toContain('new_number');
    expect(r.cleanedText).toContain('87053598811');
  });
});

describe('REVIEW_ALL', () => {
  const approved = applyGuard(ticketsFixture.original, ticketsFixture.ai, opts);

  it('sends approved submissions to the admin when enabled', () => {
    expect(applyReviewAll(approved, true).status).toBe('needs_review');
    expect(applyReviewAll(approved, false).status).toBe('approved');
  });

  it('keeps rejected as rejected', () => {
    const rejected = applyGuard('x', { ...ticketsFixture.ai, status: 'rejected' }, opts);
    expect(applyReviewAll(rejected, true).status).toBe('rejected');
  });
});

describe('Telegram HTML is never cut in the middle of an entity', () => {
  it('shortens the raw text and keeps valid escaping', () => {
    const html = buildPostHtml('other', '<&>'.repeat(2000), 300);
    expect(html.length).toBeLessThanOrEqual(300);
    // every "&" starts a complete entity
    expect(html.replace(/&(amp|lt|gt);/g, '')).not.toContain('&');
    expect(html).not.toMatch(/<(?!\/?b>)/);
  });
});

describe('hidden hyperlinks', () => {
  it('makes text_link targets visible in the text', () => {
    const text = 'Билет бар, мына жерден қараңыз';
    const entities = [{ type: 'text_link', offset: 11, length: 11, url: 'https://evil.example/x' }];
    expect(expandLinks(text, entities)).toBe('Билет бар, мына жерден (https://evil.example/x) қараңыз');
  });

  it('leaves text without link entities untouched', () => {
    expect(expandLinks('сәлем', [{ type: 'bold', offset: 0, length: 5 }])).toBe('сәлем');
    expect(expandLinks('сәлем', undefined)).toBe('сәлем');
  });
});

describe('config', () => {
  const base = { BOT_TOKEN: '1234567890:abc', OPENAI_API_KEY: 'sk-test-1234567890', DATABASE_URL: 'postgresql://x', CHANNEL_ID: '@chan', ADMIN_ID: '42' };

  it('applies safe defaults', () => {
    const c = loadConfig(base);
    expect(c.photoReview).toBe('always');
    expect(c.reviewAll).toBe(false);
    expect(c.adminId).toBe(42);
    expect(c.channelId).toBe('@chan');
  });

  it('rejects a non-numeric ADMIN_ID and never prints values', () => {
    expect(() => loadConfig({ ...base, ADMIN_ID: '@nur1keesh' })).toThrow(/ADMIN_ID/);
    try {
      loadConfig({ ...base, ADMIN_ID: '@nur1keesh' });
    } catch (e) {
      expect(String(e)).not.toContain('sk-test');
    }
  });

  it('parses numeric channel ids', () => {
    expect(loadConfig({ ...base, CHANNEL_ID: '-1001234567890' }).channelId).toBe(-1001234567890);
  });
});

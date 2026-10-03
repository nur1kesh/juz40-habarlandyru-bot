import { describe, expect, it } from 'vitest';
import { MESSAGE_LIMIT, buildPostHtml, escapeHtml, truncate } from '../src/utils/telegramFormat';

describe('Telegram HTML formatting', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('a < b && c > d')).toBe('a &lt; b &amp;&amp; c &gt; d');
  });

  it('never lets user text inject tags into the post', () => {
    const post = buildPostHtml('other', '<b>hack</b> <a href="x">link</a>');
    expect(post).not.toContain('<b>hack');
    expect(post).toContain('&lt;b&gt;hack');
  });

  it('adds a category header and keeps the body', () => {
    const post = buildPostHtml('tickets', 'Билет бар.\nБайланысу: +7 705 359 88 11');
    expect(post.startsWith('<b>🎫 Билет</b>\n\n')).toBe(true);
    expect(post).toContain('📩 Байланысу: +7 705 359 88 11');
  });

  it('has no header for "other" or unknown categories', () => {
    expect(buildPostHtml('other', 'Мәтін')).toBe('Мәтін');
    expect(buildPostHtml('weird', 'Мәтін')).toBe('Мәтін');
    expect(buildPostHtml(null, 'Мәтін')).toBe('Мәтін');
  });

  it('never adds AI attribution', () => {
    expect(buildPostHtml('housing', 'Пәтер')).not.toMatch(/AI|GPT|Generated/i);
  });

  it('respects the Telegram message limit', () => {
    expect(buildPostHtml('other', 'a'.repeat(10_000)).length).toBeLessThanOrEqual(MESSAGE_LIMIT);
    expect(truncate('abcdef', 4)).toBe('abc…');
  });
});

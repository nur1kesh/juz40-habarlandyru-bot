import type { Category } from '../types';

export const MESSAGE_LIMIT = 4096;
export const CAPTION_LIMIT = 1024;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}

// Headers are produced by code (not by the model) so they stay uniform and cannot contain invented facts.
const HEADERS: Record<Category, string | null> = {
  housing: '🏠 Тұрғын үй',
  tickets: '🎫 Билет',
  lost_found: '🔎 Жоғалды / табылды',
  buy_sell: '🛍 Сатылым',
  services: '🛠 Қызмет',
  events: '🎉 Іс-шара',
  education: '📚 Білім',
  work: '💼 Жұмыс',
  other: null,
};

/** Final channel post (Telegram HTML). Contains nothing but the announcement itself. */
export function buildPostHtml(category: string | null | undefined, cleanedText: string, maxLength = MESSAGE_LIMIT): string {
  const header = category && category in HEADERS ? HEADERS[category as Category] : null;
  const render = (text: string): string => {
    const body = text
      .split('\n')
      .map((line) => {
        const safe = escapeHtml(line);
        return /^Байланысу/i.test(line) ? `📩 ${safe}` : safe;
      })
      .join('\n');
    return header ? `<b>${escapeHtml(header)}</b>\n\n${body}` : body;
  };

  // Shorten the raw text (never the escaped HTML) so a tag or entity is never cut in half.
  let text = cleanedText;
  let html = render(text);
  while (html.length > maxLength && text.length > 1) {
    text = `${text.slice(0, Math.floor(text.length * 0.9)).trimEnd()}…`;
    html = render(text);
  }
  return html;
}

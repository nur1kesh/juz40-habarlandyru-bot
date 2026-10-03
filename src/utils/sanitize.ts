/** Input cleaning and prompt-injection helpers. */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠﻿]/g;

export function stripControlChars(s: string): string {
  return s.replace(CONTROL_CHARS, '');
}

/** Normalizes whitespace, newlines and runaway repeated characters. Does not touch meaning. */
export function cleanInput(text: string): string {
  return (
    stripControlChars(text.normalize('NFC'))
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      // "!!!!!!" -> "!!!"; digits are excluded so "10000" survives.
      .replace(/([^\d\s])\1{3,}/gu, '$1$1$1')
      .trim()
  );
}

export type InputProblem = 'empty' | 'too_long';

export type InputCheck = { ok: true; text: string } | { ok: false; reason: InputProblem };

export function validateInput(raw: string | undefined | null, maxLength: number): InputCheck {
  if (!raw) return { ok: false, reason: 'empty' };
  // Cheap guard before any heavy processing.
  if (raw.length > maxLength * 2) return { ok: false, reason: 'too_long' };
  const text = cleanInput(raw);
  if (!/[\p{L}\p{N}]/u.test(text)) return { ok: false, reason: 'empty' };
  if (text.length > maxLength) return { ok: false, reason: 'too_long' };
  return { ok: true, text };
}

const INJECTION_PATTERNS: Array<[string, RegExp]> = [
  ['ignore_instructions', /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(instructions?|rules?|prompt|guidelines?)\b/i],
  ['system_prompt', /\b(system|developer)\s+(prompt|message|instructions?)\b/i],
  ['role_override', /\b(you are now|act as|pretend to be|new instructions?)\b/i],
  ['force_approval', /\b(approve|accept|publish)\s+(this|it|the)\b/i],
  ['json_forcing', /["']?status["']?\s*[:=]\s*["']?(approved|needs_review|rejected)/i],
  ['ru_ignore', /(игнорируй|забудь|не\s+учитывай|отмени)[^.\n]{0,40}(инструкци|правил|промпт)/i],
  ['ru_force', /(одобри|опубликуй|подтверди)\s+(это|данное|объявлени)/i],
  ['kk_ignore', /(нұсқаулар|ережелер)[^.\n]{0,30}(елеме|ұмыт|өткізіп)/i],
];

/** Returns labels of suspicious patterns. Never blocks on its own: it forces human review. */
export function detectInjection(text: string): string[] {
  return INJECTION_PATTERNS.filter(([, re]) => re.test(text)).map(([label]) => label);
}

/** Prevents the user from closing the <announcement> wrapper early. */
export function neutralizeWrapperTags(text: string): string {
  return text.replace(/<\s*\/?\s*announcement[^>]*>/gi, (m) => m.replace(/</g, '‹').replace(/>/g, '›'));
}

export interface EntityLike {
  type: string;
  offset: number;
  length: number;
  url?: string;
}

/**
 * Hidden hyperlinks ("text" that points to another URL) are invisible in the plain message text.
 * They are made explicit so the AI, the guard and the admin see where they lead.
 */
export function expandLinks(text: string, entities?: EntityLike[]): string {
  if (!entities || entities.length === 0) return text;
  const links = entities.filter((e) => e.type === 'text_link' && e.url).sort((a, b) => b.offset - a.offset);
  let out = text;
  for (const e of links) {
    const label = out.slice(e.offset, e.offset + e.length);
    out = `${out.slice(0, e.offset)}${label} (${e.url})${out.slice(e.offset + e.length)}`;
  }
  return out;
}

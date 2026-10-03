import type { AiResult, AiStatus } from '../types';
import { extractPhoneKeys, normalizePhonesInText, stripPhones } from '../utils/phone';
import { detectInjection } from '../utils/sanitize';

export interface GuardOptions {
  confidenceThreshold: number;
}

export type PhotoReviewMode = 'always' | 'auto';

export interface GuardResult {
  status: AiStatus;
  cleanedText: string;
  warnings: string[];
  reason: string | null;
}

const URL_RE = /(?:https?:\/\/|www\.|t\.me\/)[^\s<>"']+/gi;
const MENTION_RE = /(?<![\w@])@[A-Za-z][\w]{3,31}/g;

function extractLinks(text: string): string[] {
  const found = [...(text.match(URL_RE) ?? []), ...(text.match(MENTION_RE) ?? [])];
  return found.map((l) => l.toLowerCase().replace(/[).,;:!?]+$/, '').replace(/^https?:\/\//, '').replace(/\/$/, ''));
}

const missingFrom = (source: string[], target: string[]): string[] => source.filter((x) => !target.includes(x));

/**
 * Code-level safety net over the model output.
 * The model may only tighten the decision; this function may downgrade `approved` to `needs_review`
 * but never upgrades `needs_review` or `rejected`.
 */
export function applyGuard(original: string, ai: AiResult, opts: GuardOptions): GuardResult {
  const warnings = [...ai.warnings];

  if (ai.status === 'rejected') {
    return { status: 'rejected', cleanedText: '', warnings, reason: ai.reason };
  }

  let status: AiStatus = ai.status;
  const reasons: string[] = [];
  const cleaned = ai.cleaned_text.trim();

  const downgrade = (tag: string, why: string): void => {
    warnings.push(tag);
    reasons.push(why);
    if (status === 'approved') status = 'needs_review';
  };

  if (!cleaned) downgrade('empty_cleaned_text', 'AI бос мәтін қайтарды');

  const injection = detectInjection(original);
  if (injection.length > 0) downgrade('prompt_injection_suspected', `Нұсқауды айналып өту әрекеті анықталды: ${injection.join(', ')}`);

  if (ai.confidence < opts.confidenceThreshold) {
    downgrade('low_confidence', `Сенімділік төмен: ${ai.confidence} (шек: ${opts.confidenceThreshold})`);
  }

  const origPhones = extractPhoneKeys(original);
  const cleanPhones = extractPhoneKeys(cleaned);
  if (missingFrom(origPhones, cleanPhones).length > 0) downgrade('phone_missing', 'Бастапқы мәтіндегі телефон нөмірі жоғалып кеткен');
  if (missingFrom(cleanPhones, origPhones).length > 0) downgrade('phone_added', 'Бастапқы мәтінде жоқ телефон нөмірі пайда болған');

  const origLinks = extractLinks(original);
  const cleanLinks = extractLinks(cleaned);
  if (missingFrom(origLinks, cleanLinks).length > 0) downgrade('link_missing', 'Бастапқы мәтіндегі сілтеме не username жоғалып кеткен');
  if (missingFrom(cleanLinks, origLinks).length > 0) downgrade('link_added', 'Бастапқы мәтінде жоқ сілтеме не username пайда болған');

  // Soft hallucination check: every multi-digit number must be traceable to the original digits.
  // Phones are excluded: they are verified separately and may legitimately change format.
  const origDigits = stripPhones(original).replace(/\D/g, '');
  const newNumbers = (stripPhones(cleaned).match(/\d{2,}/g) ?? []).filter((n) => !origDigits.includes(n));
  if (newNumbers.length > 0) downgrade('new_number', `Бастапқы мәтінде жоқ сандар пайда болған: ${newNumbers.join(', ')}`);

  if (original.length >= 40 && cleaned) {
    const ratio = cleaned.length / original.length;
    if (ratio < 0.3 || ratio > 2) downgrade('length_anomaly', `Мәтін ұзындығы тым өзгерген (қатынасы ${ratio.toFixed(2)})`);
  }

  const reason = [ai.reason, ...reasons].filter((r): r is string => Boolean(r)).join('; ') || null;
  return { status, cleanedText: normalizePhonesInText(cleaned), warnings: [...new Set(warnings)], reason };
}

/**
 * The model only sees text, so photos are never moderated by it.
 * In "always" mode an otherwise approved submission with photos goes to the admin.
 * Rejected/needs_review decisions are never changed.
 */
export function applyPhotoPolicy(result: GuardResult, photoCount: number, mode: PhotoReviewMode): GuardResult {
  if (mode !== 'always' || photoCount === 0 || result.status !== 'approved') return result;
  return {
    ...result,
    status: 'needs_review',
    warnings: [...new Set([...result.warnings, 'has_photos'])],
    reason: [result.reason, 'Суреттерді AI тексермейді, қолмен тексеру қажет'].filter(Boolean).join('; '),
  };
}

/** Optional switch from the task description: every announcement goes to the admin first. */
export function applyReviewAll(result: GuardResult, enabled: boolean): GuardResult {
  if (!enabled || result.status !== 'approved') return result;
  return {
    ...result,
    status: 'needs_review',
    warnings: [...new Set([...result.warnings, 'review_all'])],
    reason: [result.reason, 'Барлық хабарландыру қолмен тексеріледі (REVIEW_ALL)'].filter(Boolean).join('; '),
  };
}

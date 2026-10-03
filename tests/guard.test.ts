import { describe, expect, it } from 'vitest';
import { applyGuard, applyPhotoPolicy } from '../src/ai/guard';
import type { AiResult } from '../src/types';
import { housingFixture, injectionFixture, ticketsFixture } from './fixtures/announcements';

const opts = { confidenceThreshold: 0.8 };
const ok = (over: Partial<AiResult> = {}): AiResult => ({ ...ticketsFixture.ai, ...over });

describe('status handling (guard)', () => {
  it('keeps approved for a faithful edit and normalizes the phone', () => {
    const r = applyGuard(housingFixture.original, housingFixture.ai, opts);
    expect(r.status).toBe('approved');
    expect(r.cleanedText).toContain('87073613176');
  });

  it('approves the concert ticket example', () => {
    const r = applyGuard(ticketsFixture.original, ticketsFixture.ai, opts);
    expect(r.status).toBe('approved');
    expect(r.cleanedText).not.toMatch(/Қайырлы|салып бере/);
  });

  it('downgrades low confidence to needs_review', () => {
    const r = applyGuard(ticketsFixture.original, ok({ confidence: 0.71 }), opts);
    expect(r.status).toBe('needs_review');
    expect(r.warnings).toContain('low_confidence');
  });

  it('downgrades when the AI dropped the phone number', () => {
    const r = applyGuard(ticketsFixture.original, ok({ cleaned_text: 'КН концертіне билет бар.\nБағасын келісуге болады.' }), opts);
    expect(r.status).toBe('needs_review');
    expect(r.warnings).toContain('phone_missing');
  });

  it('downgrades when the AI invented a phone number', () => {
    const r = applyGuard(ticketsFixture.original, ok({ cleaned_text: `${ticketsFixture.ai.cleaned_text}\n+7 700 000 00 00` }), opts);
    expect(r.status).toBe('needs_review');
    expect(r.warnings).toContain('phone_added');
  });

  it('downgrades when the AI invented a link or a number', () => {
    const link = applyGuard(ticketsFixture.original, ok({ cleaned_text: `${ticketsFixture.ai.cleaned_text}\nhttps://evil.example` }), opts);
    expect(link.warnings).toContain('link_added');
    const price = applyGuard(ticketsFixture.original, ok({ cleaned_text: `${ticketsFixture.ai.cleaned_text}\nБаға: 25000 тг` }), opts);
    expect(price.warnings).toContain('new_number');
    expect(price.status).toBe('needs_review');
  });

  it('downgrades an empty or wildly different result', () => {
    expect(applyGuard(ticketsFixture.original, ok({ cleaned_text: '  ' }), opts).status).toBe('needs_review');
    const shrunk = applyGuard(`${ticketsFixture.original}\n${'Қосымша мәлімет '.repeat(10)}`, ok(), opts);
    expect(shrunk.warnings).toContain('length_anomaly');
  });

  it('never upgrades needs_review or rejected', () => {
    expect(applyGuard(ticketsFixture.original, ok({ status: 'needs_review', reason: 'unsure' }), opts).status).toBe('needs_review');
    const rejected = applyGuard('scam', ok({ status: 'rejected', reason: 'scam', cleaned_text: 'x' }), opts);
    expect(rejected.status).toBe('rejected');
    expect(rejected.cleanedText).toBe('');
  });

  it('carries the AI reason and guard reasons together', () => {
    const r = applyGuard(ticketsFixture.original, ok({ confidence: 0.5, reason: 'doubtful' }), opts);
    expect(r.reason).toContain('doubtful');
    expect(r.reason).toContain('Сенімділік');
  });

  it('forces review when the original contains an injection attempt, even if the AI approved', () => {
    const ai = ok({ cleaned_text: 'Пәтер жалға беремін, 150 000 тг.' });
    const r = applyGuard(injectionFixture.original, ai, opts);
    expect(r.status).toBe('needs_review');
    expect(r.warnings).toContain('prompt_injection_suspected');
  });
});

describe('photo review policy', () => {
  const approved = applyGuard(ticketsFixture.original, ticketsFixture.ai, opts);

  it('sends approved submissions with photos to manual review in "always" mode', () => {
    const r = applyPhotoPolicy(approved, 3, 'always');
    expect(r.status).toBe('needs_review');
    expect(r.warnings).toContain('has_photos');
  });

  it('leaves text-only submissions and "auto" mode untouched', () => {
    expect(applyPhotoPolicy(approved, 0, 'always').status).toBe('approved');
    expect(applyPhotoPolicy(approved, 2, 'auto').status).toBe('approved');
  });

  it('never changes a rejected decision', () => {
    const rejected = applyGuard('x', ok({ status: 'rejected', reason: 'scam' }), opts);
    expect(applyPhotoPolicy(rejected, 2, 'always').status).toBe('rejected');
  });
});

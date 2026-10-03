import { describe, expect, it } from 'vitest';
import { AiResponseError, aiJsonSchema, parseAiResponse } from '../src/ai/schema';
import { CATEGORIES } from '../src/types';
import { ticketsFixture } from './fixtures/announcements';

const valid = JSON.stringify(ticketsFixture.ai);

describe('AI response validation', () => {
  it('accepts a valid response', () => {
    expect(parseAiResponse(valid).category).toBe('tickets');
  });

  it('rejects non-JSON (no regex extraction from prose)', () => {
    expect(() => parseAiResponse(`Here you go: ${valid}`)).toThrow(AiResponseError);
  });

  it.each([
    ['unknown status', { status: 'ok' }],
    ['unknown category', { category: 'cars' }],
    ['confidence above 1', { confidence: 1.5 }],
    ['negative confidence', { confidence: -0.1 }],
    ['missing field', { reason: undefined }],
    ['wrong type', { warnings: 'none' }],
    ['extra field', { extra: true }],
  ])('rejects %s', (_name, patch) => {
    expect(() => parseAiResponse(JSON.stringify({ ...ticketsFixture.ai, ...patch }))).toThrow(AiResponseError);
  });

  it('JSON schema matches the allowed categories and is strict', () => {
    expect(aiJsonSchema.additionalProperties).toBe(false);
    expect(aiJsonSchema.properties.category.enum).toEqual([...CATEGORIES]);
    expect([...aiJsonSchema.required].sort()).toEqual(Object.keys(aiJsonSchema.properties).sort());
  });
});

import { z } from 'zod';
import { AI_STATUSES, CATEGORIES, type AiResult } from '../types';

export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiResponseError';
  }
}

/** Runtime validation. Even with strict structured outputs we never trust the payload blindly. */
export const aiResultSchema = z
  .object({
    status: z.enum(AI_STATUSES),
    category: z.enum(CATEGORIES),
    confidence: z.number().min(0).max(1),
    cleaned_text: z.string().max(10_000),
    missing_information: z.array(z.string().max(200)).max(20),
    warnings: z.array(z.string().max(200)).max(20),
    reason: z.string().max(1000).nullable(),
  })
  .strict();

/** JSON Schema sent to OpenAI (Structured Outputs, strict mode). Keep in sync with aiResultSchema. */
export const aiJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'category', 'confidence', 'cleaned_text', 'missing_information', 'warnings', 'reason'],
  properties: {
    status: { type: 'string', enum: [...AI_STATUSES] },
    category: { type: 'string', enum: [...CATEGORIES] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    cleaned_text: { type: 'string' },
    missing_information: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
    reason: { type: ['string', 'null'] },
  },
} as const;

/** Parses the model output (JSON.parse + Zod, no regex extraction). */
export function parseAiResponse(content: string): AiResult {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new AiResponseError('AI response is not valid JSON');
  }
  const parsed = aiResultSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new AiResponseError(`AI response failed schema validation: ${issues}`);
  }
  return parsed.data;
}

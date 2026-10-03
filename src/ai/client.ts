import OpenAI from 'openai';
import type { Logger } from '../utils/logger';
import type { AiAnalysis, AiAnalyzer } from '../types';
import { SYSTEM_PROMPT, buildUserMessage } from './prompt';
import { AiResponseError, aiJsonSchema, parseAiResponse } from './schema';

export interface OpenAiAnalyzerOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** Network/5xx/429 retries handled by the SDK. */
  maxRetries: number;
}

const MAX_SCHEMA_ATTEMPTS = 2;

export class OpenAiAnalyzer implements AiAnalyzer {
  private readonly client: OpenAI;

  constructor(
    private readonly opts: OpenAiAnalyzerOptions,
    private readonly log: Logger,
  ) {
    this.client = new OpenAI({ apiKey: opts.apiKey, timeout: opts.timeoutMs, maxRetries: opts.maxRetries });
  }

  async analyze(text: string): Promise<AiAnalysis> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_SCHEMA_ATTEMPTS; attempt++) {
      const started = Date.now();
      try {
        const completion = await this.client.chat.completions.create({
          model: this.opts.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserMessage(text) },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'announcement_review', strict: true, schema: aiJsonSchema as unknown as Record<string, unknown> },
          },
        });

        const choice = completion.choices[0];
        if (!choice) throw new AiResponseError('AI returned no choices');
        if (choice.message.refusal) throw new AiResponseError('AI refused to process the request');
        if (choice.finish_reason === 'length') throw new AiResponseError('AI response was truncated');
        if (!choice.message.content) throw new AiResponseError('AI returned empty content');

        const result = parseAiResponse(choice.message.content);
        this.log.info(
          { model: completion.model, ms: Date.now() - started, usage: completion.usage, status: result.status, confidence: result.confidence },
          'ai response received',
        );
        return {
          result,
          raw: { model: completion.model, usage: completion.usage, content: choice.message.content },
        };
      } catch (err) {
        lastError = err;
        // Only malformed output is retried here; transport errors were already retried by the SDK.
        if (!(err instanceof AiResponseError)) break;
        this.log.warn({ attempt, err: err.message }, 'ai response invalid, retrying');
      }
    }
    throw lastError instanceof Error ? lastError : new Error('AI analysis failed');
  }
}

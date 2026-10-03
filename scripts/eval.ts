/**
 * Optional live check against the real model: `npm run eval`.
 * Needs OPENAI_API_KEY (+ optional OPENAI_MODEL). Not part of the unit test suite.
 */
import 'dotenv/config';
import { applyGuard } from '../src/ai/guard';
import { OpenAiAnalyzer } from '../src/ai/client';
import { createLogger } from '../src/utils/logger';
import { cleanInput } from '../src/utils/sanitize';
import {
  housingFixture,
  injectionFixture,
  lostFoundFixture,
  russianFixture,
  scamFixture,
  ticketsFixture,
} from '../tests/fixtures/announcements';

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const analyzer = new OpenAiAnalyzer(
    { apiKey, model: process.env.OPENAI_MODEL ?? 'gpt-6-luna', timeoutMs: 60_000, maxRetries: 1 },
    createLogger('warn'),
  );

  for (const f of [ticketsFixture, housingFixture, lostFoundFixture, scamFixture, injectionFixture, russianFixture]) {
    const text = cleanInput(f.original);
    const { result } = await analyzer.analyze(text);
    const guarded = applyGuard(text, result, { confidenceThreshold: 0.8 });
    console.log(`\n=== ${f.name} ===`);
    console.log(`ai: ${result.status} (${result.confidence}) | final: ${guarded.status} | category: ${result.category}`);
    console.log(guarded.cleanedText || '(empty)');
    if (guarded.warnings.length) console.log('warnings:', guarded.warnings.join(', '));
    if (guarded.reason) console.log('reason:', guarded.reason);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

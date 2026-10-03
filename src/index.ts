import 'dotenv/config';
import { Telegram } from 'telegraf';
import { OpenAiAnalyzer } from './ai/client';
import { createBot } from './bot/bot';
import { loadConfig } from './config/env';
import { prisma } from './database/prisma';
import { SubmissionRepository } from './database/repositories/submissions';
import { UserRepository } from './database/repositories/users';
import { runDiagnostics } from './services/diagnostics';
import { DuplicateService } from './services/duplicateService';
import { ModerationService } from './services/moderationService';
import { Notifier } from './services/notifier';
import { PublishService } from './services/publishService';
import { RateLimitService } from './services/rateLimitService';
import { RetryWorker } from './services/retryWorker';
import { SubmissionService } from './services/submissionService';
import { createLogger } from './utils/logger';

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config.logLevel);

  const users = new UserRepository(prisma);
  const submissions = new SubmissionRepository(prisma);
  const telegram = new Telegram(config.botToken);

  const ai = new OpenAiAnalyzer(
    { apiKey: config.openaiApiKey, model: config.openaiModel, timeoutMs: config.aiTimeoutMs, maxRetries: config.aiMaxRetries },
    log,
  );
  const notifier = new Notifier(telegram, config, log);
  const publishService = new PublishService(telegram, submissions, notifier, config, log);
  const submissionService = new SubmissionService({
    config,
    ai,
    submissions,
    notifier,
    rateLimit: new RateLimitService(submissions, config),
    duplicates: new DuplicateService(submissions, config),
    log,
  });
  const moderation = new ModerationService(submissions, users, publishService, notifier, config);
  const worker = new RetryWorker(submissions, submissionService, publishService, notifier, config, log);
  const bot = createBot({ config, log, users, submissions, submissionService, publishService, moderation, notifier });

  const me = await telegram.getMe(); // fails fast on an invalid token
  await prisma.$connect();
  log.info({ bot: me.username, model: config.openaiModel }, 'starting');
  await runDiagnostics(telegram, config, me.id, log);

  void bot.launch({ allowedUpdates: ['message', 'callback_query'] }).catch((err) => {
    log.fatal({ err: err instanceof Error ? err.message : String(err) }, 'bot stopped unexpectedly');
    process.exit(1);
  });
  worker.start();

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    worker.stop();
    bot.stop(signal);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

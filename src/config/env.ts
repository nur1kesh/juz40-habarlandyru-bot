import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const schema = z.object({
  BOT_TOKEN: z.string().min(10),
  OPENAI_API_KEY: z.string().min(10),
  OPENAI_MODEL: z.string().min(1).default('gpt-6-luna'),
  DATABASE_URL: z.string().min(1),
  CHANNEL_ID: z.string().min(1),
  ADMIN_ID: z.coerce.number().int().positive(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(10),
  MAX_MESSAGE_LENGTH: z.coerce.number().int().positive().default(1500),
  DUPLICATE_WINDOW_HOURS: z.coerce.number().positive().default(24),
  AI_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  RETRY_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  NOTIFY_ADMIN_ON_REJECT: bool,
  REVIEW_ALL: bool,
  PHOTO_REVIEW: z.enum(['always', 'auto']).default('always'),
});

export interface Config {
  botToken: string;
  openaiApiKey: string;
  openaiModel: string;
  databaseUrl: string;
  channelId: string | number;
  adminId: number;
  logLevel: string;
  rateLimitMax: number;
  rateLimitWindowMinutes: number;
  maxMessageLength: number;
  duplicateWindowHours: number;
  aiConfidenceThreshold: number;
  aiTimeoutMs: number;
  aiMaxRetries: number;
  retryIntervalSeconds: number;
  maxAttempts: number;
  retentionDays: number;
  notifyAdminOnReject: boolean;
  photoReview: 'always' | 'auto';
  reviewAll: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    // Only variable names and messages are printed, never values.
    throw new Error(`Invalid environment configuration:\n  ${issues}`);
  }
  const e = parsed.data;
  const channel = /^-?\d+$/.test(e.CHANNEL_ID) ? Number(e.CHANNEL_ID) : e.CHANNEL_ID;
  return {
    botToken: e.BOT_TOKEN,
    openaiApiKey: e.OPENAI_API_KEY,
    openaiModel: e.OPENAI_MODEL,
    databaseUrl: e.DATABASE_URL,
    channelId: channel,
    adminId: e.ADMIN_ID,
    logLevel: e.LOG_LEVEL,
    rateLimitMax: e.RATE_LIMIT_MAX,
    rateLimitWindowMinutes: e.RATE_LIMIT_WINDOW_MINUTES,
    maxMessageLength: e.MAX_MESSAGE_LENGTH,
    duplicateWindowHours: e.DUPLICATE_WINDOW_HOURS,
    aiConfidenceThreshold: e.AI_CONFIDENCE_THRESHOLD,
    aiTimeoutMs: e.AI_TIMEOUT_MS,
    aiMaxRetries: e.AI_MAX_RETRIES,
    retryIntervalSeconds: e.RETRY_INTERVAL_SECONDS,
    maxAttempts: e.MAX_ATTEMPTS,
    retentionDays: e.RETENTION_DAYS,
    notifyAdminOnReject: e.NOTIFY_ADMIN_ON_REJECT,
    photoReview: e.PHOTO_REVIEW,
    reviewAll: e.REVIEW_ALL,
  };
}

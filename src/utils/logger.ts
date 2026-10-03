import pino from 'pino';

export type Logger = pino.Logger;

/** Secrets must never be passed to the logger, redact is a second line of defence. */
export function createLogger(level = 'info'): Logger {
  return pino({
    level,
    redact: {
      paths: ['*.apiKey', '*.token', '*.botToken', '*.openaiApiKey', 'apiKey', 'token', 'botToken'],
      censor: '[REDACTED]',
    },
  });
}

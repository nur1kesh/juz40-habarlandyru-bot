import type { Config } from '../config/env';
import type { SubmissionRepository } from '../database/repositories/submissions';

export type RateLimitResult = { allowed: true } | { allowed: false; retryInMinutes: number };

export class RateLimitService {
  constructor(
    private readonly submissions: SubmissionRepository,
    private readonly config: Config,
  ) {}

  async check(userId: number, now = new Date()): Promise<RateLimitResult> {
    const windowMs = this.config.rateLimitWindowMinutes * 60_000;
    const since = new Date(now.getTime() - windowMs);
    const count = await this.submissions.countSince(userId, since);
    if (count < this.config.rateLimitMax) return { allowed: true };
    const oldest = await this.submissions.oldestSince(userId, since);
    const resetAt = (oldest?.createdAt.getTime() ?? now.getTime()) + windowMs;
    return { allowed: false, retryInMinutes: Math.max(1, Math.ceil((resetAt - now.getTime()) / 60_000)) };
  }
}

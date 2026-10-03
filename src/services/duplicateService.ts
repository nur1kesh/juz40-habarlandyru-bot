import type { SubmissionStatus } from '@prisma/client';
import type { Config } from '../config/env';
import type { SubmissionRepository } from '../database/repositories/submissions';

/** Statuses that make a repeated identical text a duplicate. Rejected/cancelled/failed ones may be resent. */
const BLOCKING: SubmissionStatus[] = ['received', 'processing', 'approved', 'needs_review', 'publishing', 'published', 'error', 'publish_failed'];

export class DuplicateService {
  constructor(
    private readonly submissions: SubmissionRepository,
    private readonly config: Config,
  ) {}

  async isDuplicate(userId: number, textHash: string, now = new Date()): Promise<boolean> {
    const since = new Date(now.getTime() - this.config.duplicateWindowHours * 3_600_000);
    return (await this.submissions.findRecentByHash(userId, textHash, since, BLOCKING)) !== null;
  }
}

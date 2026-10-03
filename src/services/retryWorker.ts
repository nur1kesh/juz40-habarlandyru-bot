import { adminMsg as msg } from '../bot/messages.kk';
import type { Config } from '../config/env';
import type { SubmissionRepository } from '../database/repositories/submissions';
import type { Logger } from '../utils/logger';
import type { Notifier } from './notifier';
import type { PublishService } from './publishService';
import type { SubmissionService } from './submissionService';

// Longer than the worst-case AI call (timeout x SDK retries x schema retries).
const STALE_MS = 10 * 60_000;
const PURGE_EVERY_MS = 6 * 3_600_000;

/** Single in-process worker: retries failed AI calls and failed publications, recovers stuck records. */
export class RetryWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastPurge = 0;

  constructor(
    private readonly submissions: SubmissionRepository,
    private readonly service: SubmissionService,
    private readonly publisher: PublishService,
    private readonly notifier: Notifier,
    private readonly config: Config,
    private readonly log: Logger,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), this.config.retryIntervalSeconds * 1000);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const staleBefore = new Date(now.getTime() - STALE_MS);
      // Back-off: a record is retried only after it has been idle for the retry interval.
      const idleBefore = new Date(now.getTime() - this.config.retryIntervalSeconds * 1000);

      // 1. Interrupted processing (crash/restart) is treated like an AI error.
      for (const s of await this.submissions.findByStatusOlderThan(['received', 'processing'], staleBefore)) {
        if (s.attempts >= this.config.maxAttempts) await this.service.escalate(s.id, msg.escalation.processing);
        else await this.service.process(s.id, ['received', 'processing'], false);
      }

      // 2. AI errors.
      for (const s of await this.submissions.findByStatusOlderThan(['error'], idleBefore)) {
        if (s.attempts >= this.config.maxAttempts) {
          await this.service.escalate(s.id, s.lastError ?? msg.escalation.ai);
        } else {
          this.log.info({ submissionId: s.id, attempt: s.attempts }, 'retrying ai processing');
          await this.service.process(s.id, ['error'], false);
        }
      }

      // 3. Telegram publication errors.
      for (const s of await this.submissions.findByStatusOlderThan(['publish_failed'], idleBefore)) {
        if (s.attempts >= this.config.maxAttempts) {
          await this.service.escalate(s.id, s.lastError ?? msg.escalation.publish);
        } else {
          this.log.info({ submissionId: s.id, attempt: s.attempts }, 'retrying publication');
          await this.publisher.publish(s.id, ['publish_failed']);
        }
      }

      // 4. A crash mid-publication: the message may or may not be in the channel, so a human decides.
      for (const s of await this.submissions.findByStatusOlderThan(['publishing'], staleBefore)) {
        await this.submissions.update(s.id, { status: 'needs_review', lastError: msg.escalation.interruptedPublish });
        await this.notifier.adminAlert(msg.interrupted(s.id));
      }

      // 5. Admin notification that never arrived (admin had not started the bot, Telegram outage...).
      for (const s of await this.submissions.findUnnotifiedReviews(idleBefore)) {
        const full = await this.submissions.getById(s.id);
        if (!full) continue;
        const adminMessageId = await this.notifier.adminCard(full);
        if (adminMessageId) await this.submissions.update(s.id, { adminMessageId });
      }

      if (now.getTime() - this.lastPurge > PURGE_EVERY_MS) {
        this.lastPurge = now.getTime();
        const cutoff = new Date(now.getTime() - this.config.retentionDays * 86_400_000);
        const purged = await this.submissions.purgeFinished(cutoff);
        if (purged > 0) this.log.info({ purged }, 'purged old submission texts');
      }
    } catch (err) {
      this.log.error({ err: err instanceof Error ? err.message : String(err) }, 'retry worker tick failed');
    } finally {
      this.running = false;
    }
  }
}

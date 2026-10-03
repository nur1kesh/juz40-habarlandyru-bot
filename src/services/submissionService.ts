import type { Prisma, SubmissionStatus, User } from '@prisma/client';
import { applyGuard, applyPhotoPolicy, applyReviewAll } from '../ai/guard';
import { adminMsg } from '../bot/messages.kk';
import type { Config } from '../config/env';
import type { SubmissionRepository } from '../database/repositories/submissions';
import type { AiAnalyzer } from '../types';
import type { Logger } from '../utils/logger';
import { hashText } from '../utils/normalize';
import { validateInput, type InputProblem } from '../utils/sanitize';
import type { DuplicateService } from './duplicateService';
import type { Notifier } from './notifier';
import type { RateLimitService } from './rateLimitService';

export type IntakeOutcome =
  | { kind: 'invalid'; reason: InputProblem }
  | { kind: 'rate_limited'; retryInMinutes: number }
  | { kind: 'duplicate' }
  | { kind: 'accepted'; submissionId: number };

export interface IntakeInput {
  user: User;
  rawText: string | undefined;
  photoFileIds: string[];
  parentId: number | null;
}

interface Deps {
  config: Config;
  ai: AiAnalyzer;
  submissions: SubmissionRepository;
  notifier: Notifier;
  rateLimit: RateLimitService;
  duplicates: DuplicateService;
  log: Logger;
}

export class SubmissionService {
  constructor(private readonly d: Deps) {}

  /** Validation, rate limit, duplicate check and persistence. Does NOT call the AI. */
  async intake(input: IntakeInput): Promise<IntakeOutcome> {
    const { user } = input;
    const check = validateInput(input.rawText, this.d.config.maxMessageLength);
    if (!check.ok) return { kind: 'invalid', reason: check.reason };

    const limit = await this.d.rateLimit.check(user.id);
    if (!limit.allowed) {
      this.d.log.warn({ userId: user.id }, 'rate limit hit');
      return { kind: 'rate_limited', retryInMinutes: limit.retryInMinutes };
    }

    const textHash = hashText(check.text);
    if (await this.d.duplicates.isDuplicate(user.id, textHash)) {
      this.d.log.info({ userId: user.id }, 'duplicate submission');
      return { kind: 'duplicate' };
    }

    const sub = await this.d.submissions.create({
      userId: user.id,
      originalText: check.text,
      textHash,
      photoFileIds: input.photoFileIds,
      parentId: input.parentId,
    });
    this.d.log.info({ submissionId: sub.id, userId: user.id, length: check.text.length }, 'submission received');
    return { kind: 'accepted', submissionId: sub.id };
  }

  /**
   * Runs the AI pipeline for a submission. Never throws: failures are persisted as `error`
   * so the retry worker can pick the submission up again. Nothing is lost.
   */
  async process(id: number, from: SubmissionStatus[] = ['received'], notifyOnError = true): Promise<void> {
    try {
      if (!(await this.d.submissions.claim(id, from, 'processing', true))) return;
      const sub = await this.d.submissions.getById(id);
      if (!sub) return;

      const started = Date.now();
      this.d.log.info({ submissionId: id, userId: sub.userId, attempt: sub.attempts }, 'ai request');

      let analysis;
      try {
        analysis = await this.d.ai.analyze(sub.originalText);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.d.log.error({ submissionId: id, err: message }, 'ai request failed');
        await this.d.submissions.update(id, { status: 'error', lastError: message.slice(0, 500) });
        if (notifyOnError) await this.d.notifier.userTechnicalError(sub);
        return;
      }

      const { result, raw } = analysis;
      const guarded = applyReviewAll(
        applyPhotoPolicy(
          applyGuard(sub.originalText, result, { confidenceThreshold: this.d.config.aiConfidenceThreshold }),
          sub.photoFileIds.length,
          this.d.config.photoReview,
        ),
        this.d.config.reviewAll,
      );

      const updated = await this.d.submissions.update(id, {
        status: guarded.status,
        cleanedText: guarded.cleanedText || null,
        category: result.category,
        aiStatus: result.status,
        aiConfidence: result.confidence,
        aiReason: guarded.reason,
        aiWarnings: guarded.warnings as Prisma.InputJsonValue,
        missingInformation: result.missing_information as Prisma.InputJsonValue,
        aiRawResponse: raw as Prisma.InputJsonValue,
        lastError: null,
        // AI attempts are done: publishing gets its own retry budget.
        attempts: 0,
      });
      this.d.log.info(
        { submissionId: id, aiStatus: result.status, finalStatus: guarded.status, confidence: result.confidence, ms: Date.now() - started },
        'submission processed',
      );

      const fresh = { ...sub, ...updated };
      switch (guarded.status) {
        case 'approved':
          await this.d.notifier.userPreview(fresh);
          break;
        case 'needs_review': {
          const adminMessageId = await this.d.notifier.adminCard(fresh);
          if (adminMessageId) await this.d.submissions.update(id, { adminMessageId });
          await this.d.notifier.userNeedsReview(fresh);
          break;
        }
        case 'rejected':
          await this.d.notifier.userRejected(fresh);
          if (this.d.config.notifyAdminOnReject) {
            await this.d.notifier.adminAlert(adminMsg.autoRejected(id, guarded.reason ?? 'себебі көрсетілмеген'));
          }
          break;
      }
    } catch (err) {
      // Defensive: even DB/Telegram failures here must not crash the process.
      this.d.log.error({ submissionId: id, err: err instanceof Error ? err.message : String(err) }, 'process crashed');
    }
  }

  /** Gives up on automatic retries: hands the submission to the admin so it is never lost. */
  async escalate(id: number, why: string): Promise<void> {
    await this.d.submissions.update(id, { status: 'needs_review', lastError: why.slice(0, 500) });
    const sub = await this.d.submissions.getById(id);
    if (!sub) return;
    const adminMessageId = await this.d.notifier.adminCard(sub);
    if (adminMessageId) await this.d.submissions.update(id, { adminMessageId });
    await this.d.notifier.userNeedsReview(sub);
  }
}

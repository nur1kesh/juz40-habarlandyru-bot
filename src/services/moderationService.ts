import type { Config } from '../config/env';
import type { SubmissionRepository } from '../database/repositories/submissions';
import type { UserRepository } from '../database/repositories/users';
import { cleanInput } from '../utils/sanitize';
import { normalizePhonesInText } from '../utils/phone';
import type { Notifier } from './notifier';
import type { PublishOutcome, PublishService } from './publishService';
import { adminMsg } from '../bot/messages.kk';

/** Admin decisions on `needs_review` submissions. */
export class ModerationService {
  constructor(
    private readonly submissions: SubmissionRepository,
    private readonly users: UserRepository,
    private readonly publisher: PublishService,
    private readonly notifier: Notifier,
    private readonly config: Config,
  ) {}

  async publish(id: number): Promise<PublishOutcome> {
    // A human decision gets a fresh retry budget (the submission may have been escalated after failures).
    await this.submissions.update(id, { attempts: 0 });
    return this.publisher.publish(id, ['needs_review']);
  }

  async reject(id: number): Promise<boolean> {
    if (!(await this.submissions.claim(id, ['needs_review'], 'rejected'))) return false;
    const sub = await this.submissions.getById(id);
    if (sub) await this.notifier.userRejected(sub);
    return true;
  }

  async startEdit(adminUserId: number, id: number): Promise<boolean> {
    const sub = await this.submissions.getById(id);
    if (!sub || sub.status !== 'needs_review') return false;
    await this.users.setAwaitingEdit(adminUserId, id);
    return true;
  }

  /** Admin text is published as is (only whitespace/phone formatting) and is not re-sent to the AI. */
  async applyEdit(adminUserId: number, id: number, text: string): Promise<boolean> {
    const sub = await this.submissions.getById(id);
    await this.users.setAwaitingEdit(adminUserId, null);
    if (!sub || sub.status !== 'needs_review') return false;
    const updated = await this.submissions.update(id, { cleanedText: normalizePhonesInText(cleanInput(text)) });
    const adminMessageId = await this.notifier.adminCard({ ...sub, ...updated }, adminMsg.editedHeader);
    if (adminMessageId) await this.submissions.update(id, { adminMessageId });
    return true;
  }

  isAdmin(telegramId: number): boolean {
    return telegramId === this.config.adminId;
  }
}

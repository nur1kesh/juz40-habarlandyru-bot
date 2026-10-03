import type { Telegram } from 'telegraf';
import type { Config } from '../config/env';
import { adminKeyboard, userKeyboard } from '../bot/keyboards';
import { adminMsg, msg } from '../bot/messages.kk';
import type { SubmissionWithUser } from '../database/repositories/submissions';
import type { Logger } from '../utils/logger';
import { buildPostHtml, escapeHtml, truncate } from '../utils/telegramFormat';

/** Every outgoing private message goes through here; delivery failures never break the pipeline. */
export class Notifier {
  constructor(
    private readonly telegram: Telegram,
    private readonly config: Config,
    private readonly log: Logger,
  ) {}

  private async safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      this.log.error({ err: err instanceof Error ? err.message : String(err), label }, 'telegram notification failed');
      return null;
    }
  }

  private chat(sub: SubmissionWithUser): number {
    return Number(sub.user.telegramId);
  }

  text(chatId: number, text: string): Promise<unknown> {
    return this.safe('text', () => this.telegram.sendMessage(chatId, text));
  }

  userPreview(sub: SubmissionWithUser): Promise<unknown> {
    const post = buildPostHtml(sub.category, sub.cleanedText ?? '', 3500);
    const note = sub.photoFileIds.length > 0 ? `\n\n${escapeHtml(msg.previewPhotoNote(sub.photoFileIds.length))}` : '';
    const body = `${escapeHtml(msg.previewIntro)}\n\n${post}${note}\n\n${escapeHtml(msg.previewOutro)}`;
    return this.safe('userPreview', () =>
      this.telegram.sendMessage(this.chat(sub), body, {
        parse_mode: 'HTML',
        reply_markup: userKeyboard(sub.id).reply_markup,
      }),
    );
  }

  userNeedsReview(sub: SubmissionWithUser): Promise<unknown> {
    return this.text(this.chat(sub), msg.needsReviewUser);
  }

  userRejected(sub: SubmissionWithUser): Promise<unknown> {
    return this.text(this.chat(sub), msg.rejectedUser);
  }

  userTechnicalError(sub: SubmissionWithUser): Promise<unknown> {
    return this.text(this.chat(sub), msg.technicalError);
  }

  userPublished(sub: SubmissionWithUser): Promise<unknown> {
    return this.text(this.chat(sub), msg.published);
  }

  /** Photos are sent first so the admin can actually see what is going to be published. */
  private async adminPhotos(sub: SubmissionWithUser): Promise<void> {
    const photos = sub.photoFileIds.slice(0, 10);
    if (photos.length === 0) return;
    await this.safe('adminPhotos', async () => {
      if (photos.length === 1) return this.telegram.sendPhoto(this.config.adminId, photos[0] as string);
      return this.telegram.sendMediaGroup(
        this.config.adminId,
        photos.map((media) => ({ type: 'photo' as const, media })),
      );
    });
  }

  /** Returns the admin message id (stored for traceability). */
  async adminCard(sub: SubmissionWithUser, header: string = adminMsg.header): Promise<number | null> {
    await this.adminPhotos(sub);
    const author = sub.user.username ? `@${sub.user.username}` : String(sub.user.telegramId);
    const warnings = Array.isArray(sub.aiWarnings)
      ? (sub.aiWarnings as string[]).map((w) => adminMsg.warningTags[w] ?? w).join(', ')
      : '';
    const L = adminMsg.label;

    const build = (html: boolean): string => {
      const e = html ? escapeHtml : (x: string) => x;
      const b = (x: string) => (html ? `<b>${e(x)}</b>` : x);
      const pre = (x: string) => (html ? `<pre>${e(x)}</pre>` : x);
      return [
        b(header),
        `${L.id}: ${sub.id} · ${L.author}: ${e(author)}`,
        `${L.category}: ${e(sub.category ?? '—')}`,
        `${L.confidence}: ${sub.aiConfidence?.toFixed(2) ?? '—'}`,
        warnings ? `${L.warnings}: ${e(warnings)}` : '',
        sub.aiReason ? `${L.reason}: ${e(truncate(sub.aiReason, 400))}` : '',
        sub.lastError ? `${L.error}: ${e(truncate(sub.lastError, 300))}` : '',
        sub.photoFileIds.length > 0 ? `🖼 ${L.photos}: ${sub.photoFileIds.length}` : '',
        '',
        b(L.original),
        pre(truncate(sub.originalText, 1000)),
        b(L.aiVersion),
        pre(truncate(sub.cleanedText ?? L.none, 1000)),
      ]
        .filter((l, i, arr) => l !== '' || arr[i - 1] !== '')
        .join('\n');
    };

    const markup = adminKeyboard(sub.id).reply_markup;
    let sent = await this.safe('adminCard', () =>
      this.telegram.sendMessage(this.config.adminId, build(true), { parse_mode: 'HTML', reply_markup: markup }),
    );
    if (!sent) {
      // A formatting problem must never leave a submission without an admin notification.
      sent = await this.safe('adminCardPlain', () =>
        this.telegram.sendMessage(this.config.adminId, truncate(build(false), 4000), { reply_markup: markup }),
      );
    }
    return sent ? sent.message_id : null;
  }

  adminAlert(text: string): Promise<unknown> {
    return this.text(this.config.adminId, text);
  }
}

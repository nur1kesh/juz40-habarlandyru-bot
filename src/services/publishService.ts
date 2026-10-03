import { TelegramError, type Telegram } from 'telegraf';
import type { SubmissionStatus } from '@prisma/client';
import type { Config } from '../config/env';
import type { SubmissionRepository } from '../database/repositories/submissions';
import type { Logger } from '../utils/logger';
import { CAPTION_LIMIT, buildPostHtml } from '../utils/telegramFormat';
import type { Notifier } from './notifier';

const MAX_ALBUM_PHOTOS = 10;

export type PublishOutcome = 'published' | 'failed' | 'not_claimable';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class PublishService {
  constructor(
    private readonly telegram: Telegram,
    private readonly submissions: SubmissionRepository,
    private readonly notifier: Notifier,
    private readonly config: Config,
    private readonly log: Logger,
  ) {}

  /**
   * Publishes a submission. The atomic claim (`from` -> publishing) makes double clicks and concurrent
   * workers harmless. A submission is only `published` after Telegram confirmed the message.
   */
  async publish(id: number, from: SubmissionStatus[]): Promise<PublishOutcome> {
    if (!(await this.submissions.claim(id, from, 'publishing', true))) return 'not_claimable';
    const sub = await this.submissions.getById(id);
    if (!sub) return 'not_claimable';

    try {
      if (!sub.cleanedText) throw new Error('Nothing to publish: cleanedText is empty');
      const messageId = await this.withRateLimitRetry(() => this.sendToChannel(sub.category, sub.cleanedText as string, sub.photoFileIds));
      await this.submissions.update(id, { status: 'published', publishedMessageId: messageId, lastError: null });
      this.log.info({ submissionId: id, messageId }, 'published to channel');
      await this.notifier.userPublished(sub);
      return 'published';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.submissions.update(id, { status: 'publish_failed', lastError: message.slice(0, 500) });
      this.log.error({ submissionId: id, err: message }, 'publish failed');
      return 'failed';
    }
  }

  /** Returns the id of the first message of the post (Telegram albums allow up to 10 photos). */
  private async sendToChannel(category: string | null, text: string, photoFileIds: string[]): Promise<number> {
    const html = buildPostHtml(category, text);
    const channel = this.config.channelId;
    const photos = photoFileIds.slice(0, MAX_ALBUM_PHOTOS);
    const fitsCaption = html.length <= CAPTION_LIMIT;

    if (photos.length === 1) {
      const [photo] = photos as [string];
      if (fitsCaption) {
        const m = await this.telegram.sendPhoto(channel, photo, { caption: html, parse_mode: 'HTML' });
        return m.message_id;
      }
      await this.telegram.sendPhoto(channel, photo);
    } else if (photos.length > 1) {
      const media = photos.map((fileId, i) => ({
        type: 'photo' as const,
        media: fileId,
        ...(i === 0 && fitsCaption ? { caption: html, parse_mode: 'HTML' as const } : {}),
      }));
      const album = await this.telegram.sendMediaGroup(channel, media);
      const firstId = album[0]?.message_id;
      if (fitsCaption && firstId !== undefined) return firstId;
    }
    const m = await this.telegram.sendMessage(channel, html, { parse_mode: 'HTML' });
    return m.message_id;
  }

  private async withRateLimitRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const wait = err instanceof TelegramError && err.response.error_code === 429 ? err.response.parameters?.retry_after : undefined;
        if (!wait || attempt >= retries) throw err;
        this.log.warn({ wait }, 'telegram rate limit, waiting');
        await sleep((wait + 1) * 1000);
      }
    }
  }
}

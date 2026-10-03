import type { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { expandLinks, validateInput } from '../../utils/sanitize';
import type { BotContext, BotDeps } from '../context';
import { msg } from '../messages.kk';

const ALBUM_WAIT_MS = 1200;

interface Album {
  ctx: BotContext;
  fileIds: string[];
  caption: string | undefined;
  timer: NodeJS.Timeout | undefined;
}

export function registerMessageHandlers(bot: Telegraf<BotContext>, deps: BotDeps): void {
  const { config, log, users, submissions, submissionService, moderation } = deps;

  async function handle(ctx: BotContext, rawText: string | undefined, photoFileIds: string[]): Promise<void> {
    if (rawText?.startsWith('/')) return; // unknown command
    const user = ctx.dbUser;
    log.info({ userId: user.id, telegramId: Number(user.telegramId), photos: photoFileIds.length, length: rawText?.length ?? 0 }, 'incoming message');

    let parentId: number | null = null;
    let inheritedPhotos: string[] = [];

    if (user.awaitingEditSubmissionId !== null) {
      const pending = await submissions.getById(user.awaitingEditSubmissionId);

      // Admin editing a needs_review submission: text is stored as is, no AI.
      if (pending && pending.status === 'needs_review' && moderation.isAdmin(Number(user.telegramId))) {
        const check = validateInput(rawText, config.maxMessageLength);
        if (!check.ok) {
          await ctx.reply(check.reason === 'empty' ? msg.empty : msg.tooLong(config.maxMessageLength));
          return;
        }
        const ok = await moderation.applyEdit(user.id, pending.id, check.text);
        await ctx.reply(ok ? msg.adminSaved : msg.alreadyHandled);
        return;
      }

      if (pending && pending.status === 'approved' && pending.userId === user.id) {
        parentId = pending.id;
        inheritedPhotos = pending.photoFileIds;
      } else {
        await users.setAwaitingEdit(user.id, null);
      }
    }

    const outcome = await submissionService.intake({
      user,
      rawText,
      photoFileIds: photoFileIds.length > 0 ? photoFileIds : inheritedPhotos,
      parentId,
    });

    switch (outcome.kind) {
      case 'invalid':
        await ctx.reply(outcome.reason === 'empty' ? msg.empty : msg.tooLong(config.maxMessageLength));
        return;
      case 'rate_limited':
        await ctx.reply(msg.rateLimited(outcome.retryInMinutes));
        return;
      case 'duplicate':
        await ctx.reply(msg.duplicate);
        return;
      case 'accepted':
        if (parentId !== null) {
          await submissions.claim(parentId, ['approved'], 'cancelled');
          await users.setAwaitingEdit(user.id, null);
        }
        await ctx.reply(msg.processing);
        // Fire and forget: the AI call can take a while and process() never throws.
        void submissionService.process(outcome.submissionId);
        return;
    }
  }

  bot.on(message('text'), (ctx) => handle(ctx, expandLinks(ctx.message.text, ctx.message.entities), []));

  // Telegram delivers every photo of an album as a separate update sharing media_group_id,
  // and only one of them carries the caption. Collect them briefly and handle as one submission.
  const albums = new Map<string, Album>();

  bot.on(message('photo'), async (ctx) => {
    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];
    if (!largest) return;
    const groupId = ctx.message.media_group_id;

    if (!groupId) {
      await handle(ctx, expandLinks(ctx.message.caption ?? '', ctx.message.caption_entities) || undefined, [largest.file_id]);
      return;
    }

    const album = albums.get(groupId) ?? { ctx, fileIds: [], caption: undefined, timer: undefined };
    album.fileIds.push(largest.file_id);
    album.caption = album.caption ?? (expandLinks(ctx.message.caption ?? '', ctx.message.caption_entities) || undefined);
    if (album.timer) clearTimeout(album.timer);
    album.timer = setTimeout(() => {
      albums.delete(groupId);
      handle(album.ctx, album.caption, album.fileIds).catch((err) => {
        log.error({ err: err instanceof Error ? err.message : String(err) }, 'album handling failed');
      });
    }, ALBUM_WAIT_MS);
    albums.set(groupId, album);
  });

  bot.on(message(), async (ctx) => {
    await ctx.reply(msg.unsupported);
  });

}

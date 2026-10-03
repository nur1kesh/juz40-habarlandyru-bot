import type { Telegraf } from 'telegraf';
import { adminOnly } from '../../middleware/adminOnly';
import type { BotContext, BotDeps } from '../context';
import { adminMsg, msg } from '../messages.kk';

const stripButtons = (ctx: BotContext): Promise<unknown> => ctx.editMessageReplyMarkup(undefined).catch(() => undefined);

export function registerCallbacks(bot: Telegraf<BotContext>, deps: BotDeps): void {
  const { config, log, users, submissions, publishService, moderation } = deps;

  // ---------- author ----------
  bot.action(/^u:(pub|edit|cancel):(\d+)$/, async (ctx) => {
    const action = ctx.match[1];
    const id = Number(ctx.match[2]);
    const user = ctx.dbUser;

    const sub = await submissions.getById(id);
    if (!sub || sub.userId !== user.id) {
      await ctx.answerCbQuery(msg.notFound);
      return;
    }
    if (sub.status !== 'approved') {
      await ctx.answerCbQuery(msg.alreadyHandled);
      await stripButtons(ctx);
      return;
    }
    log.info({ submissionId: id, userId: user.id, action }, 'author callback');

    switch (action) {
      case 'pub': {
        await ctx.answerCbQuery();
        await stripButtons(ctx);
        const outcome = await publishService.publish(id, ['approved']);
        if (outcome === 'failed') await ctx.reply(msg.publishFailed);
        return;
      }
      case 'edit':
        await ctx.answerCbQuery();
        await users.setAwaitingEdit(user.id, id);
        await ctx.reply(msg.editPrompt);
        return;
      case 'cancel':
        await submissions.claim(id, ['approved'], 'cancelled');
        if (user.awaitingEditSubmissionId === id) await users.setAwaitingEdit(user.id, null);
        await ctx.answerCbQuery();
        await stripButtons(ctx);
        await ctx.reply(msg.cancelled);
        return;
    }
  });

  // ---------- admin ----------
  bot.action(/^a:(pub|edit|rej):(\d+)$/, adminOnly(config.adminId), async (ctx) => {
    const action = ctx.match[1];
    const id = Number(ctx.match[2]);
    const sub = await submissions.getById(id);

    if (!sub || sub.status !== 'needs_review') {
      await ctx.answerCbQuery(msg.alreadyHandled);
      await stripButtons(ctx);
      return;
    }
    log.info({ submissionId: id, action }, 'admin callback');

    switch (action) {
      case 'pub': {
        if (!sub.cleanedText) {
          await ctx.answerCbQuery(adminMsg.noText, { show_alert: true });
          return;
        }
        await ctx.answerCbQuery();
        const outcome = await moderation.publish(id);
        await stripButtons(ctx);
        await ctx.reply(outcome === 'published' ? `${adminMsg.published} #${id}` : adminMsg.publishFailed(id));
        return;
      }
      case 'rej':
        await moderation.reject(id);
        await ctx.answerCbQuery();
        await stripButtons(ctx);
        await ctx.reply(`${adminMsg.rejected} #${id}`);
        return;
      case 'edit':
        await moderation.startEdit(ctx.dbUser.id, id);
        await ctx.answerCbQuery();
        await ctx.reply(adminMsg.editPrompt);
        return;
    }
  });
}

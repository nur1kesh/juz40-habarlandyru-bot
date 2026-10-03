import type { Telegraf } from 'telegraf';
import type { BotContext, BotDeps } from '../context';
import { msg } from '../messages.kk';

export function registerCommands(bot: Telegraf<BotContext>, deps: BotDeps): void {
  bot.start((ctx) => ctx.reply(msg.start));
  bot.help((ctx) => ctx.reply(msg.help));

  bot.command('cancel', async (ctx) => {
    const user = ctx.dbUser;
    const hadAwaiting = user.awaitingEditSubmissionId !== null;
    if (hadAwaiting) await deps.users.setAwaitingEdit(user.id, null);

    const open = await deps.submissions.findLatestOpenForUser(user.id);
    const cancelled = open ? await deps.submissions.claim(open.id, ['approved', 'needs_review'], 'cancelled') : false;
    await ctx.reply(cancelled || hadAwaiting ? msg.cancelled : msg.nothingToCancel);
  });
}

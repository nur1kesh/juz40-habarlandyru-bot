import { Telegraf } from 'telegraf';
import { userContext } from '../middleware/userContext';
import type { BotContext, BotDeps } from './context';
import { registerCallbacks } from './handlers/callbacks';
import { registerCommands } from './handlers/commands';
import { registerMessageHandlers } from './handlers/message';
import { msg } from './messages.kk';

export function createBot(deps: BotDeps): Telegraf<BotContext> {
  // handlerTimeout is generous: handlers return quickly, AI work is detached.
  const bot = new Telegraf<BotContext>(deps.config.botToken, { handlerTimeout: 120_000 });

  bot.use(userContext(deps.users));
  registerCommands(bot, deps);
  registerCallbacks(bot, deps);
  registerMessageHandlers(bot, deps);

  bot.catch(async (err, ctx) => {
    deps.log.error({ err: err instanceof Error ? err.message : String(err), updateType: ctx.updateType }, 'unhandled bot error');
    await ctx.reply(msg.genericError).catch(() => undefined);
  });

  return bot;
}

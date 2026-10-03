import type { MiddlewareFn } from 'telegraf';
import { adminMsg } from '../bot/messages.kk';
import type { BotContext } from '../bot/context';

/** Guards admin callbacks. The admin id comes from ENV, never from code. */
export function adminOnly(adminId: number): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (ctx.from?.id !== adminId) {
      await ctx.answerCbQuery(adminMsg.forbidden).catch(() => undefined);
      return;
    }
    return next();
  };
}

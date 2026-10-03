import type { MiddlewareFn } from 'telegraf';
import type { BotContext } from '../bot/context';
import type { UserRepository } from '../database/repositories/users';

/** Private chats only; resolves/creates the DB user and puts it into ctx.dbUser. */
export function userContext(users: UserRepository): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (!ctx.from || ctx.from.is_bot) return;
    if (ctx.chat && ctx.chat.type !== 'private') return;
    ctx.dbUser = await users.upsert(ctx.from);
    return next();
  };
}

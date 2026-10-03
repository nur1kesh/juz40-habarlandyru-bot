import type { Telegram } from 'telegraf';
import type { Config } from '../config/env';
import type { Logger } from '../utils/logger';

/** Non-fatal startup checks: configuration mistakes are visible immediately, not at the first publication. */
export async function runDiagnostics(telegram: Telegram, config: Config, botId: number, log: Logger): Promise<void> {
  try {
    await telegram.getChat(config.adminId);
  } catch {
    log.warn({ adminId: config.adminId }, 'admin chat is not reachable: the admin must press /start in the bot');
  }

  try {
    const member = await telegram.getChatMember(config.channelId, botId);
    if (member.status !== 'administrator' && member.status !== 'creator') {
      log.error({ channel: config.channelId, status: member.status }, 'bot is not an administrator of the channel');
    } else if (member.status === 'administrator' && member.can_post_messages === false) {
      log.error({ channel: config.channelId }, 'bot is an administrator but cannot post messages');
    } else {
      log.info({ channel: config.channelId }, 'channel access ok');
    }
  } catch (err) {
    log.error({ channel: config.channelId, err: err instanceof Error ? err.message : String(err) }, 'cannot access the channel: check CHANNEL_ID and that the bot is its administrator');
  }
}

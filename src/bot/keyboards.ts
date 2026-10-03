import { Markup } from 'telegraf';

export const userKeyboard = (id: number) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('✅ Жариялау', `u:pub:${id}`)],
    [Markup.button.callback('✏️ Өзгерту', `u:edit:${id}`), Markup.button.callback('❌ Болдырмау', `u:cancel:${id}`)],
  ]);

export const adminKeyboard = (id: number) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('✅ Жариялау', `a:pub:${id}`)],
    [Markup.button.callback('✏️ Өңдеу', `a:edit:${id}`), Markup.button.callback('❌ Қабылдамау', `a:rej:${id}`)],
  ]);

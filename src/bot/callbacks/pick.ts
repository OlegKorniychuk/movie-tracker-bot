import type { Bot } from 'grammy';
import type { Db } from '../../db/client.js';
import { trackedPicks } from '../../db/schema.js';

export function registerPickCallback(bot: Bot, db: Db): void {
  bot.callbackQuery(/^pick:(\d+)$/, async (ctx) => {
    if (!ctx.chat) {
      await ctx.answerCallbackQuery();
      return;
    }

    const movieId = Number(ctx.match[1]);
    await db.insert(trackedPicks).values({ chatId: ctx.chat.id, movieId }).onConflictDoNothing();
    await ctx.answerCallbackQuery({ text: "Нагадаємо у день прем'єри ✅" });
  });
}

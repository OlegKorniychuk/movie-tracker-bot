import { and, eq } from 'drizzle-orm';
import type { Bot } from 'grammy';
import type { Db } from '../../db/client.js';
import { trackedPicks } from '../../db/schema.js';

export function registerCancelCallback(bot: Bot, db: Db): void {
  bot.callbackQuery(/^cancel:(\d+)$/, async (ctx) => {
    if (!ctx.chat) {
      await ctx.answerCallbackQuery();
      return;
    }

    const pickId = Number(ctx.match[1]);
    await db
      .update(trackedPicks)
      .set({ cancelledAt: new Date().toISOString() })
      .where(and(eq(trackedPicks.id, pickId), eq(trackedPicks.chatId, ctx.chat.id)));
    await ctx.answerCallbackQuery({ text: 'Скасовано' });
  });
}

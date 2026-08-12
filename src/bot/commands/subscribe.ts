import { eq } from 'drizzle-orm';
import type { Bot } from 'grammy';
import type { Db } from '../../db/client.js';
import { subscriptions } from '../../db/schema.js';

const WELCOME_MESSAGE = `Привіт! Раз на два тижні надсилатиму афішу нових релізів у кіно.

Натисніть кнопку під фільмом, щоб отримати нагадування в день прем'єри.

/unsubscribe — відписатися від афіші
/mymovies — переглянути заплановані нагадування`;

export function registerSubscribeCommands(bot: Bot, db: Db): void {
  bot.command(['start', 'subscribe'], async (ctx) => {
    await db.insert(subscriptions).values({ chatId: ctx.chat.id }).onConflictDoNothing();
    await ctx.reply(WELCOME_MESSAGE);
  });

  bot.command('unsubscribe', async (ctx) => {
    await db.delete(subscriptions).where(eq(subscriptions.chatId, ctx.chat.id));
    await ctx.reply('Відписано від афіші. Повернутися можна командою /subscribe.');
  });
}

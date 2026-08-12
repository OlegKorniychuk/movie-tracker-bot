import { and, eq, isNull } from 'drizzle-orm';
import { InlineKeyboard, type Bot } from 'grammy';
import type { Db } from '../../db/client.js';
import { movies as moviesTable, trackedPicks } from '../../db/schema.js';
import { formatReleaseDate } from '../../formatDate.js';

const NO_PICKS_MESSAGE =
  'Немає запланованих нагадувань. Обирайте фільми з афіші кнопкою «🎬 Хочу подивитись».';

export function registerMymoviesCommand(bot: Bot, db: Db): void {
  bot.command('mymovies', async (ctx) => {
    if (!ctx.chat) return;

    const picks = await db
      .select({
        pickId: trackedPicks.id,
        uaTitle: moviesTable.uaTitle,
        releaseDate: moviesTable.releaseDate,
      })
      .from(trackedPicks)
      .innerJoin(moviesTable, eq(trackedPicks.movieId, moviesTable.id))
      .where(
        and(
          eq(trackedPicks.chatId, ctx.chat.id),
          isNull(trackedPicks.cancelledAt),
          isNull(trackedPicks.notifiedAt),
        ),
      )
      .orderBy(moviesTable.releaseDate);

    if (picks.length === 0) {
      await ctx.reply(NO_PICKS_MESSAGE);
      return;
    }

    for (const pick of picks) {
      const keyboard = new InlineKeyboard().text('❌ Скасувати', `cancel:${pick.pickId}`);
      await ctx.reply(`🎬 ${pick.uaTitle}\n📅 ${formatReleaseDate(pick.releaseDate)}`, {
        reply_markup: keyboard,
      });
    }
  });
}

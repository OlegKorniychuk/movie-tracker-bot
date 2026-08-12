import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import type { Bot } from 'grammy';
import type { Db } from '../db/client.js';
import { movies as moviesTable, trackedPicks } from '../db/schema.js';
import { escapeHtml } from '../escapeHtml.js';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// releaseDate <= today (not strictly ==) so a missed or delayed cron trigger
// still catches up on the next run, instead of silently losing a reminder
// that fell on a day this job didn't fire.
export async function runReminders(db: Db, bot: Bot): Promise<void> {
  const today = todayIsoDate();

  const due = await db
    .select({
      pickId: trackedPicks.id,
      chatId: trackedPicks.chatId,
      uaTitle: moviesTable.uaTitle,
    })
    .from(trackedPicks)
    .innerJoin(moviesTable, eq(trackedPicks.movieId, moviesTable.id))
    .where(
      and(
        lte(moviesTable.releaseDate, today),
        isNull(trackedPicks.cancelledAt),
        isNull(trackedPicks.notifiedAt),
      ),
    );

  if (due.length === 0) {
    console.log('Reminders: nothing due today');
    return;
  }

  const sentPickIds: number[] = [];
  for (const pick of due) {
    try {
      await bot.api.sendMessage(
        pick.chatId,
        `🎉 Сьогодні прем'єра: <b>${escapeHtml(pick.uaTitle)}</b>!`,
        { parse_mode: 'HTML' },
      );
      sentPickIds.push(pick.pickId);
    } catch (err) {
      console.error(`Failed to send reminder for pick ${pick.pickId}:`, err);
    }
  }

  if (sentPickIds.length > 0) {
    const now = new Date().toISOString();
    await db
      .update(trackedPicks)
      .set({ notifiedAt: now })
      .where(inArray(trackedPicks.id, sentPickIds));
  }
}

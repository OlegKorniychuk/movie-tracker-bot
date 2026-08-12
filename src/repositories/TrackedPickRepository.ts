import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { movies as moviesTable, trackedPicks } from '../db/schema.js';

export interface ActivePick {
  pickId: number;
  uaTitle: string;
  releaseDate: string;
}

export interface DuePick {
  pickId: number;
  chatId: number;
  uaTitle: string;
}

export class TrackedPickRepository {
  constructor(private readonly db: Db) {}

  async create(chatId: number, movieId: number): Promise<void> {
    await this.db.insert(trackedPicks).values({ chatId, movieId }).onConflictDoNothing();
  }

  async cancel(pickId: number, chatId: number): Promise<void> {
    await this.db
      .update(trackedPicks)
      .set({ cancelledAt: new Date().toISOString() })
      .where(and(eq(trackedPicks.id, pickId), eq(trackedPicks.chatId, chatId)));
  }

  // Already-reminded picks (notifiedAt set) intentionally drop off this list
  // — "scheduled notifications" means still-pending ones.
  async listActiveForChat(chatId: number): Promise<ActivePick[]> {
    return this.db
      .select({
        pickId: trackedPicks.id,
        uaTitle: moviesTable.uaTitle,
        releaseDate: moviesTable.releaseDate,
      })
      .from(trackedPicks)
      .innerJoin(moviesTable, eq(trackedPicks.movieId, moviesTable.id))
      .where(
        and(
          eq(trackedPicks.chatId, chatId),
          isNull(trackedPicks.cancelledAt),
          isNull(trackedPicks.notifiedAt),
        ),
      )
      .orderBy(moviesTable.releaseDate);
  }

  // releaseDate <= today (not ==) so a missed/delayed cron trigger still
  // catches up on the next run instead of silently losing a reminder.
  async findDueReminders(todayIso: string): Promise<DuePick[]> {
    return this.db
      .select({
        pickId: trackedPicks.id,
        chatId: trackedPicks.chatId,
        uaTitle: moviesTable.uaTitle,
      })
      .from(trackedPicks)
      .innerJoin(moviesTable, eq(trackedPicks.movieId, moviesTable.id))
      .where(
        and(
          lte(moviesTable.releaseDate, todayIso),
          isNull(trackedPicks.cancelledAt),
          isNull(trackedPicks.notifiedAt),
        ),
      );
  }

  // Not chunked — preserved as-is from the original implementation (same
  // known D1 param-limit exposure at very large volumes as
  // MovieRepository.markDigested).
  async markNotified(pickIds: number[], isoNow: string): Promise<void> {
    if (pickIds.length === 0) return;
    await this.db
      .update(trackedPicks)
      .set({ notifiedAt: isoNow })
      .where(inArray(trackedPicks.id, pickIds));
  }
}

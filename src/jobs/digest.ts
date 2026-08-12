import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import type { Bot } from 'grammy';
import type { Db } from '../db/client.js';
import { meta, movies as moviesTable, subscriptions } from '../db/schema.js';
import { digestKeyboard, formatDigestCaption } from '../bot/digest-message.js';
import { mergeMovieSources } from '../movies/merge.js';
import { upsertMovies } from '../movies/upsert.js';
import { getMultiplexUpcoming } from '../sources/multiplex.js';
import { getPlanetakinoUpcoming } from '../sources/planetakino.js';

const DIGEST_INTERVAL_DAYS = 14;
const DIGEST_WINDOW_DAYS = 28;
const SEND_DELAY_MS = 350; // stay well under Telegram's per-chat rate limit
const LAST_DIGEST_KEY = 'last_digest_at';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysSince(isoDateTime: string): number {
  return (Date.now() - new Date(isoDateTime).getTime()) / MS_PER_DAY;
}

function isoDateDaysFromNow(days: number): string {
  return new Date(Date.now() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

async function getLastDigestAt(db: Db): Promise<string | null> {
  const [row] = await db.select().from(meta).where(eq(meta.key, LAST_DIGEST_KEY));
  return row?.value ?? null;
}

async function setLastDigestAt(db: Db, isoDateTime: string): Promise<void> {
  await db
    .insert(meta)
    .values({ key: LAST_DIGEST_KEY, value: isoDateTime })
    .onConflictDoUpdate({ target: meta.key, set: { value: isoDateTime } });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendDigestMovie(bot: Bot, chatId: number, movie: typeof moviesTable.$inferSelect) {
  const caption = formatDigestCaption(movie);
  const keyboard = digestKeyboard(movie.id);
  try {
    if (movie.posterUrl) {
      await bot.api.sendPhoto(chatId, movie.posterUrl, {
        caption,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else {
      await bot.api.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  } catch (err) {
    console.error(`Failed to send digest movie ${movie.id} to chat ${chatId}:`, err);
  }
}

export async function runDigest(db: Db, bot: Bot, tmdbApiKey: string): Promise<void> {
  const lastDigestAt = await getLastDigestAt(db);
  if (lastDigestAt !== null && daysSince(lastDigestAt) < DIGEST_INTERVAL_DAYS) {
    console.log(
      `Digest gated: last run ${lastDigestAt}, ${daysSince(lastDigestAt).toFixed(1)} days ago`,
    );
    return;
  }

  const [planetakino, multiplex] = await Promise.all([
    getPlanetakinoUpcoming(),
    getMultiplexUpcoming(),
  ]);
  const merged = await mergeMovieSources(planetakino, multiplex, tmdbApiKey);
  await upsertMovies(db, merged);

  const windowEnd = isoDateDaysFromNow(DIGEST_WINDOW_DAYS);
  const newMovies = await db
    .select()
    .from(moviesTable)
    .where(and(isNull(moviesTable.digestedAt), lte(moviesTable.releaseDate, windowEnd)));

  const now = new Date().toISOString();

  if (newMovies.length === 0) {
    console.log('Digest: no new movies in window to send');
    await setLastDigestAt(db, now);
    return;
  }

  const subscribers = await db.select().from(subscriptions);
  if (subscribers.length === 0) {
    // Nobody to send to — leave these movies undigested so whoever
    // subscribes later still gets them, instead of silently losing them.
    console.log('Digest: no subscribers, leaving fetched movies undigested');
    await setLastDigestAt(db, now);
    return;
  }

  for (const subscriber of subscribers) {
    for (const movie of newMovies) {
      await sendDigestMovie(bot, subscriber.chatId, movie);
      await sleep(SEND_DELAY_MS);
    }
  }

  await db
    .update(moviesTable)
    .set({ digestedAt: now })
    .where(
      inArray(
        moviesTable.id,
        newMovies.map((movie) => movie.id),
      ),
    );
  await setLastDigestAt(db, now);
}

import { http, HttpResponse } from 'msw';
import {
  getDb,
  getWorker,
  network,
  resetHarness,
  setupHarness,
  teardownHarness,
} from '../support/harness.js';
import { telegramCalls } from '../support/mockHandlers.js';

const REMINDER_CRON = '0 9 * * *';

function isoDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function seedMovie(db: D1Database, uaTitle: string, releaseDate: string): Promise<number> {
  const normalizedTitle = uaTitle.toLowerCase();
  await db
    .prepare(
      `INSERT INTO movies
      (normalized_title, original_title, ua_title, year, countries, short_description, poster_url, imdb_rating, cast, release_date, digested_at)
     VALUES (?, ?, ?, ?, '[]', NULL, NULL, NULL, '[]', ?, ?)`,
    )
    .bind(normalizedTitle, uaTitle, uaTitle, 2026, releaseDate, new Date().toISOString())
    .run();
  const row = await db
    .prepare('SELECT id FROM movies WHERE normalized_title = ?')
    .bind(normalizedTitle)
    .first<{ id: number }>();
  if (!row) throw new Error('seedMovie: insert did not stick');
  return row.id;
}

async function seedPick(db: D1Database, chatId: number, movieId: number): Promise<number> {
  await db
    .prepare('INSERT INTO tracked_picks (chat_id, movie_id) VALUES (?, ?)')
    .bind(chatId, movieId)
    .run();
  const row = await db
    .prepare('SELECT id FROM tracked_picks WHERE chat_id = ? AND movie_id = ?')
    .bind(chatId, movieId)
    .first<{ id: number }>();
  if (!row) throw new Error('seedPick: insert did not stick');
  return row.id;
}

beforeAll(async () => {
  await setupHarness();
});

beforeEach(async () => {
  await resetHarness();
});

afterAll(async () => {
  await teardownHarness();
});

describe('reminder cron (0 9 * * *)', () => {
  it('sends a reminder for a pick due today and marks it notified', async () => {
    const worker = getWorker();
    const db = await getDb();
    const movieId = await seedMovie(db, "Прем'єра Сьогодні", isoDate(0));
    const pickId = await seedPick(db, 77, movieId);

    await worker.scheduled({ cron: REMINDER_CRON, scheduledTime: new Date() });

    const sends = telegramCalls.filter((c) => c.method === 'sendMessage');
    expect(sends).toHaveLength(1);
    expect(sends[0]?.body.chat_id).toBe(77);

    const pick = await db
      .prepare('SELECT notified_at FROM tracked_picks WHERE id = ?')
      .bind(pickId)
      .first<{ notified_at: string | null }>();
    expect(pick?.notified_at).not.toBeNull();
  });

  it('sends nothing when no picks are due', async () => {
    const worker = getWorker();
    const db = await getDb();
    const movieId = await seedMovie(db, "Прем'єра Завтра", isoDate(1));
    await seedPick(db, 77, movieId);

    await worker.scheduled({ cron: REMINDER_CRON, scheduledTime: new Date() });

    expect(telegramCalls.filter((c) => c.method === 'sendMessage')).toHaveLength(0);
  });

  it("one pick's send failure doesn't block the others from being notified", async () => {
    const worker = getWorker();
    const db = await getDb();
    const failingMovieId = await seedMovie(db, 'Провальний Показ', isoDate(0));
    const okMovieId = await seedMovie(db, 'Успішний Показ', isoDate(0));
    const failingPickId = await seedPick(db, 501, failingMovieId);
    const okPickId = await seedPick(db, 502, okMovieId);

    network.use(
      http.post('https://api.telegram.org/bot*/sendMessage', async ({ request }) => {
        const body = (await request.json()) as { chat_id: number };
        if (body.chat_id === 501) return new HttpResponse(null, { status: 500 });
        telegramCalls.push({ method: 'sendMessage', body });
        return HttpResponse.json({ ok: true, result: { message_id: 1 } });
      }),
    );

    await worker.scheduled({ cron: REMINDER_CRON, scheduledTime: new Date() });

    expect(telegramCalls.some((c) => c.body.chat_id === 502)).toBe(true);

    const failingPick = await db
      .prepare('SELECT notified_at FROM tracked_picks WHERE id = ?')
      .bind(failingPickId)
      .first<{ notified_at: string | null }>();
    expect(failingPick?.notified_at).toBeNull();

    const okPick = await db
      .prepare('SELECT notified_at FROM tracked_picks WHERE id = ?')
      .bind(okPickId)
      .first<{ notified_at: string | null }>();
    expect(okPick?.notified_at).not.toBeNull();
  });
});

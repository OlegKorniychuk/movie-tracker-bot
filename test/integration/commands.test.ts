import {
  getDb,
  getWorker,
  resetHarness,
  setupHarness,
  teardownHarness,
} from '../support/harness.js';
import { telegramCalls } from '../support/mockHandlers.js';
import { callbackQueryUpdate, commandUpdate } from '../support/fixtures.js';
import { messages } from '../../src/bot/messages.js';

async function seedMovie(db: D1Database, uaTitle: string, releaseDate: string): Promise<number> {
  const normalizedTitle = uaTitle.toLowerCase();
  await db
    .prepare(
      `INSERT INTO movies
      (normalized_title, original_title, ua_title, year, countries, short_description, poster_url, imdb_rating, cast, release_date, digested_at)
     VALUES (?, ?, ?, ?, '[]', NULL, NULL, NULL, '[]', ?, NULL)`,
    )
    .bind(normalizedTitle, uaTitle, uaTitle, 2026, releaseDate)
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

async function sendWebhook(update: unknown, secret = 'test-secret') {
  return getWorker().fetch('/', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': secret,
    },
    body: JSON.stringify(update),
  });
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

describe('bot commands', () => {
  it('/start creates a subscription and sends the welcome message', async () => {
    const db = await getDb();
    await sendWebhook(commandUpdate(100, '/start'));

    const sub = await db
      .prepare('SELECT chat_id FROM subscriptions WHERE chat_id = ?')
      .bind(100)
      .first();
    expect(sub).toEqual({ chat_id: 100 });

    const sends = telegramCalls.filter((c) => c.method === 'sendMessage');
    expect(sends).toHaveLength(1);
    expect(sends[0]?.body.text).toBe(messages.welcome);
  });

  it('/subscribe also creates a subscription and sends the welcome message', async () => {
    const db = await getDb();
    await sendWebhook(commandUpdate(101, '/subscribe'));

    const sub = await db
      .prepare('SELECT chat_id FROM subscriptions WHERE chat_id = ?')
      .bind(101)
      .first();
    expect(sub).toEqual({ chat_id: 101 });
  });

  it('/unsubscribe removes the subscription and sends a confirmation', async () => {
    const db = await getDb();
    await sendWebhook(commandUpdate(102, '/start'));
    await sendWebhook(commandUpdate(102, '/unsubscribe'));

    const sub = await db
      .prepare('SELECT chat_id FROM subscriptions WHERE chat_id = ?')
      .bind(102)
      .first();
    expect(sub).toBeNull();

    const sends = telegramCalls.filter((c) => c.method === 'sendMessage');
    expect(sends[sends.length - 1]?.body.text).toBe(messages.unsubscribed);
  });

  it('/mymovies with no active picks sends the noPicks message', async () => {
    await sendWebhook(commandUpdate(103, '/mymovies'));

    const sends = telegramCalls.filter((c) => c.method === 'sendMessage');
    expect(sends).toHaveLength(1);
    expect(sends[0]?.body.text).toBe(messages.noPicks);
  });

  it('/mymovies with active picks sends one message per pick with a cancel button', async () => {
    const db = await getDb();
    const movieId = await seedMovie(db, 'Активний Пік', '2026-09-01');
    const pickId = await seedPick(db, 104, movieId);

    await sendWebhook(commandUpdate(104, '/mymovies'));

    const sends = telegramCalls.filter((c) => c.method === 'sendMessage');
    expect(sends).toHaveLength(1);
    expect(sends[0]?.body.text).toBe(messages.myMoviesEntry('Активний Пік', '2026-09-01'));
    const keyboard = sends[0]?.body.reply_markup as {
      inline_keyboard: { text: string; callback_data: string }[][];
    };
    expect(keyboard.inline_keyboard[0]?.[0]).toEqual({
      text: '❌ Скасувати',
      callback_data: `cancel:${pickId}`,
    });
  });

  it('pick:<movieId> callback creates a tracked pick and answers with a confirmation toast', async () => {
    const db = await getDb();
    const movieId = await seedMovie(db, 'Обраний Фільм', '2026-09-10');

    await sendWebhook(callbackQueryUpdate(105, `pick:${movieId}`));

    const pick = await db
      .prepare('SELECT chat_id FROM tracked_picks WHERE chat_id = ? AND movie_id = ?')
      .bind(105, movieId)
      .first();
    expect(pick).toEqual({ chat_id: 105 });

    const toasts = telegramCalls.filter((c) => c.method === 'answerCallbackQuery');
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.body.text).toBe("Нагадаємо у день прем'єри ✅");

    const sends = telegramCalls.filter((c) => c.method === 'sendMessage');
    expect(sends).toHaveLength(1);
    expect(sends[0]?.body.text).toBe("Нагадаємо у день прем'єри ✅");
  });

  it('cancel:<pickId> callback cancels the tracked pick and answers with a confirmation toast', async () => {
    const db = await getDb();
    const movieId = await seedMovie(db, 'Скасований Фільм', '2026-09-15');
    const pickId = await seedPick(db, 106, movieId);

    await sendWebhook(callbackQueryUpdate(106, `cancel:${pickId}`));

    const pick = await db
      .prepare('SELECT cancelled_at FROM tracked_picks WHERE id = ?')
      .bind(pickId)
      .first<{ cancelled_at: string | null }>();
    expect(pick?.cancelled_at).not.toBeNull();

    const toasts = telegramCalls.filter((c) => c.method === 'answerCallbackQuery');
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.body.text).toBe('Скасовано');

    const sends = telegramCalls.filter((c) => c.method === 'sendMessage');
    expect(sends).toHaveLength(1);
    expect(sends[0]?.body.text).toBe('Скасовано');
  });

  it('rejects a webhook request with the wrong secret token and produces no side effects', async () => {
    const db = await getDb();
    const res = await sendWebhook(commandUpdate(107, '/start'), 'wrong-secret');

    expect(res.status).not.toBe(200);
    const sub = await db
      .prepare('SELECT chat_id FROM subscriptions WHERE chat_id = ?')
      .bind(107)
      .first();
    expect(sub).toBeNull();
    expect(telegramCalls).toHaveLength(0);
  });
});

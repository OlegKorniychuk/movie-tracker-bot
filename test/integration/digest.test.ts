import {
  getDb,
  getWorker,
  network,
  resetHarness,
  server,
  setupHarness,
  teardownHarness,
} from '../support/harness.js';
import {
  multiplexServes,
  planetakinoFails,
  planetakinoSucceeds,
  telegramCalls,
} from '../support/mockHandlers.js';

const DIGEST_CRON = '0 9 * * 1';

function daysFromNowIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function seedSubscriber(chatId: number): Promise<void> {
  const db = await getDb();
  await db.prepare('INSERT INTO subscriptions (chat_id) VALUES (?)').bind(chatId).run();
}

async function seedLastDigestAt(daysAgo: number): Promise<void> {
  const db = await getDb();
  const value = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  await db
    .prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
    .bind('last_digest_at', value)
    .run();
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

describe('digest cron (0 9 * * 1)', () => {
  it('sends new in-window movies to all subscribers and marks them digested', async () => {
    await seedSubscriber(42);
    network.use(
      planetakinoSucceeds([
        { name: 'Тестовий фільм', originalName: 'Test Movie', releaseDate: daysFromNowIso(3) },
      ]),
    );

    const worker = getWorker();
    await worker.scheduled({ cron: DIGEST_CRON, scheduledTime: new Date() });

    const sends = telegramCalls.filter(
      (c) => c.method === 'sendPhoto' || c.method === 'sendMessage',
    );
    expect(sends).toHaveLength(1);
    expect(sends[0]?.body.chat_id).toBe(42);

    const db = await getDb();
    const movie = await db
      .prepare('SELECT digested_at FROM movies WHERE ua_title = ?')
      .bind('Тестовий фільм')
      .first<{ digested_at: string | null }>();
    expect(movie?.digested_at).not.toBeNull();

    const lastDigestAt = await db
      .prepare('SELECT value FROM meta WHERE key = ?')
      .bind('last_digest_at')
      .first<{ value: string }>();
    expect(lastDigestAt?.value).toBeTruthy();
  });

  it('is gated when the last digest ran less than 14 days ago', async () => {
    await seedSubscriber(42);
    await seedLastDigestAt(3);
    network.use(
      planetakinoSucceeds([
        {
          name: 'Не має надіслатись',
          originalName: 'Should Not Send',
          releaseDate: daysFromNowIso(3),
        },
      ]),
    );

    const worker = getWorker();
    await worker.scheduled({ cron: DIGEST_CRON, scheduledTime: new Date() });

    expect(telegramCalls).toHaveLength(0);
    const db = await getDb();
    const movieCount = await db.prepare('SELECT COUNT(*) as count FROM movies').first<{
      count: number;
    }>();
    expect(movieCount?.count).toBe(0);
  });

  it('falls back to Multiplex when Planetakino errors, and logs a warning', async () => {
    await seedSubscriber(42);
    network.use(planetakinoFails());
    network.use(
      ...multiplexServes([{ id: '111', daysFromNow: 3 }], {
        '111': {
          name: 'Мультиплекс Фільм',
          originalTitle: 'Multiplex Movie',
          releaseDate: daysFromNowIso(3),
        },
      }),
    );

    const worker = getWorker();
    await worker.scheduled({ cron: DIGEST_CRON, scheduledTime: new Date() });

    const sends = telegramCalls.filter(
      (c) => c.method === 'sendPhoto' || c.method === 'sendMessage',
    );
    expect(sends).toHaveLength(1);
    expect(sends[0]?.body.chat_id).toBe(42);

    const logs = server.getLogs();
    expect(
      logs.some((log: { message: string }) => log.message.includes('PlanetakinoSource failed')),
    ).toBe(true);
  });

  it('fetches and stores movies but sends nothing when there are no subscribers', async () => {
    network.use(
      planetakinoSucceeds([
        { name: 'Без підписників', originalName: 'No Subscribers', releaseDate: daysFromNowIso(3) },
      ]),
    );

    const worker = getWorker();
    await worker.scheduled({ cron: DIGEST_CRON, scheduledTime: new Date() });

    expect(telegramCalls).toHaveLength(0);
    const db = await getDb();
    const movieCount = await db.prepare('SELECT COUNT(*) as count FROM movies').first<{
      count: number;
    }>();
    expect(movieCount?.count).toBe(1);
  });

  it('sends nothing when the fetched movies are already digested', async () => {
    await seedSubscriber(42);
    network.use(
      planetakinoSucceeds([
        { name: 'Вже надіслано', originalName: 'Already Sent', releaseDate: daysFromNowIso(3) },
      ]),
    );

    const worker = getWorker();
    await worker.scheduled({ cron: DIGEST_CRON, scheduledTime: new Date() });
    expect(telegramCalls).toHaveLength(1);

    // Second run 14+ days later (simulated via last_digest_at seed) with the
    // same movie still returned by the source: already digested, must not resend.
    const db = await getDb();
    await db
      .prepare('UPDATE meta SET value = ? WHERE key = ?')
      .bind(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), 'last_digest_at')
      .run();

    await worker.scheduled({ cron: DIGEST_CRON, scheduledTime: new Date() });
    expect(telegramCalls).toHaveLength(1);
  });
});

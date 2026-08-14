import { createTestHarness } from 'wrangler';
import { setupServer } from 'msw/node';
import { defaultHandlers, resetTelegramCalls } from './mockHandlers.js';

export const network = setupServer(...defaultHandlers);

export const server = createTestHarness({
  workers: [
    {
      configPath: './wrangler.jsonc',
      env: 'dev',
      secrets: {
        TELEGRAM_BOT_TOKEN: 'test-token',
        WEBHOOK_SECRET: 'test-secret',
        TMDB_API_KEY: 'unused',
      },
    },
  ],
});

export function getWorker() {
  return server.getWorker<Env>();
}

// Env's generated `DB` binding type is optional (wrangler types it defensively);
// the test harness always configures it, so assert once here instead of at
// every call site.
export async function getDb(): Promise<D1Database> {
  const env = await getWorker().getEnv();
  if (!env.DB) throw new Error('DB binding missing from test harness env');
  return env.DB;
}

export async function setupHarness(): Promise<void> {
  network.listen({ onUnhandledRequest: 'error' });
  await server.listen();
  await getWorker().applyD1Migrations('DB');
}

export async function resetHarness(): Promise<void> {
  network.resetHandlers();
  resetTelegramCalls();
  await server.reset();
  await getWorker().applyD1Migrations('DB');
}

export async function teardownHarness(): Promise<void> {
  network.close();
  await server.close();
}

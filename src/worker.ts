import { BotError, webhookCallback } from 'grammy';
import { createBot } from './bot/bot.js';
import { createDb } from './db/client.js';
import { runDigest } from './jobs/digest.js';
import { runReminders } from './jobs/reminders.js';

export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TMDB_API_KEY: string;
  WEBHOOK_SECRET: string;
}

// Must match wrangler.toml's [triggers] crons exactly.
const WEEKLY_DIGEST_GATE_CRON = '0 9 * * 1';
const DAILY_REMINDER_CRON = '0 9 * * *';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const bot = createBot(env);
    const handleUpdate = webhookCallback(bot, 'cloudflare-mod', {
      secretToken: env.WEBHOOK_SECRET,
    });
    try {
      return await handleUpdate(request);
    } catch (error) {
      if (error instanceof BotError) {
        // Webhook mode: bot.catch() never fires (only handleUpdates/long-polling
        // uses it) — handleUpdate always throws, so this is the actual error
        // boundary. Respond 200 regardless so Telegram doesn't retry an update
        // that will keep failing the same way.
        console.error('Error while handling update:', error.error);
        return new Response('ok');
      }
      throw error;
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    if (controller.cron === WEEKLY_DIGEST_GATE_CRON) {
      const db = createDb(env);
      const bot = createBot(env);
      await runDigest(db, bot, env.TMDB_API_KEY);
    } else if (controller.cron === DAILY_REMINDER_CRON) {
      const db = createDb(env);
      const bot = createBot(env);
      await runReminders(db, bot);
    } else {
      console.warn(`Unexpected cron trigger: ${controller.cron}`);
    }
  },
} satisfies ExportedHandler<Env>;

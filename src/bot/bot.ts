import { Bot } from 'grammy';
import { createDb } from '../db/client.js';
import type { Env } from '../worker.js';
import { registerCancelCallback } from './callbacks/cancel.js';
import { registerPickCallback } from './callbacks/pick.js';
import { registerMymoviesCommand } from './commands/mymovies.js';
import { registerSubscribeCommands } from './commands/subscribe.js';

export function createBot(env: Env): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const db = createDb(env);

  registerSubscribeCommands(bot, db);
  registerMymoviesCommand(bot, db);
  registerPickCallback(bot, db);
  registerCancelCallback(bot, db);

  return bot;
}

import { Bot, BotError, webhookCallback } from 'grammy';
import { BotEventHandler } from './botEventHandler.js';

export class TelegramBotApp {
  readonly bot: Bot;

  constructor(
    token: string,
    private readonly webhookSecret: string,
    handlers: BotEventHandler[],
  ) {
    this.bot = new Bot(token);
    this.registerHandlers(handlers);
  }

  async handleWebhook(request: Request): Promise<Response> {
    const handleUpdate = webhookCallback(this.bot, 'cloudflare-mod', {
      secretToken: this.webhookSecret,
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
  }

  private registerHandlers(handlers: BotEventHandler[]): void {
    handlers.forEach((handler) => handler.register(this.bot));
  }
}

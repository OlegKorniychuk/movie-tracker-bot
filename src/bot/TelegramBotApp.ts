import { Bot, BotError, webhookCallback, type InlineKeyboard } from 'grammy';
import { BotEventHandler } from './botEventHandler.js';

export interface SendMessageOptions {
  photoUrl?: string | null;
  keyboard?: InlineKeyboard;
}

export class TelegramBotApp {
  private readonly bot: Bot;

  constructor(
    token: string,
    private readonly webhookSecret: string,
  ) {
    this.bot = new Bot(token);
  }

  registerHandlers(handlers: BotEventHandler[]): void {
    handlers.forEach((handler) => handler.register(this.bot));
  }

  async sendMessage(chatId: number, text: string, options: SendMessageOptions = {}): Promise<void> {
    if (options.photoUrl) {
      await this.bot.api.sendPhoto(chatId, options.photoUrl, {
        caption: text,
        parse_mode: 'HTML',
        reply_markup: options.keyboard,
      });
    } else {
      await this.bot.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: options.keyboard,
      });
    }
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
}

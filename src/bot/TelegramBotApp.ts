import { Bot, BotError, webhookCallback } from 'grammy';
import type { PickService } from '../services/PickService.js';
import type { SubscriptionService } from '../services/SubscriptionService.js';
import { CancelCallbackHandler } from './callbacks/CancelCallbackHandler.js';
import { PickCallbackHandler } from './callbacks/PickCallbackHandler.js';
import { MymoviesCommandHandler } from './commands/MymoviesCommandHandler.js';
import { SubscribeCommandHandler } from './commands/SubscribeCommandHandler.js';

export class TelegramBotApp {
  readonly bot: Bot;

  constructor(
    token: string,
    private readonly webhookSecret: string,
    subscriptionService: SubscriptionService,
    pickService: PickService,
  ) {
    this.bot = new Bot(token);
    new SubscribeCommandHandler(subscriptionService).register(this.bot);
    new MymoviesCommandHandler(pickService).register(this.bot);
    new PickCallbackHandler(pickService).register(this.bot);
    new CancelCallbackHandler(pickService).register(this.bot);
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

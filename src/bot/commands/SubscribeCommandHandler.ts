import type { Bot } from 'grammy';
import type { SubscriptionService } from '../../services/SubscriptionService.js';
import { BotEventHandler } from '../botEventHandler.js';
import { messages } from '../messages.js';
import type { TelegramBotApp } from '../TelegramBotApp.js';

export class SubscribeCommandHandler implements BotEventHandler {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly telegramBotApp: TelegramBotApp,
  ) {}

  register(bot: Bot): void {
    bot.command(['start', 'subscribe'], async (ctx) => {
      await this.subscriptionService.subscribe(ctx.chat.id);
      await this.telegramBotApp.sendMessage(ctx.chat.id, messages.welcome);
    });

    bot.command('unsubscribe', async (ctx) => {
      await this.subscriptionService.unsubscribe(ctx.chat.id);
      await this.telegramBotApp.sendMessage(ctx.chat.id, messages.unsubscribed);
    });
  }
}

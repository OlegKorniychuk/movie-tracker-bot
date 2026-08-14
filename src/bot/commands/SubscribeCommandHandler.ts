import type { Bot } from 'grammy';
import type { SubscriptionService } from '../../services/SubscriptionService.js';
import { BotEventHandler } from '../botEventHandler.js';
import { messages } from '../messages.js';

export class SubscribeCommandHandler implements BotEventHandler {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  register(bot: Bot): void {
    bot.command(['start', 'subscribe'], async (ctx) => {
      await this.subscriptionService.subscribe(ctx.chat.id);
      await ctx.reply(messages.welcome);
    });

    bot.command('unsubscribe', async (ctx) => {
      await this.subscriptionService.unsubscribe(ctx.chat.id);
      await ctx.reply(messages.unsubscribed);
    });
  }
}

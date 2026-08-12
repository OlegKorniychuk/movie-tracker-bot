import type { Bot } from 'grammy';
import type { SubscriptionService } from '../../services/SubscriptionService.js';

const WELCOME_MESSAGE = `Привіт! Раз на два тижні надсилатиму афішу нових релізів у кіно.

Натисніть кнопку під фільмом, щоб отримати нагадування в день прем'єри.

/unsubscribe — відписатися від афіші
/mymovies — переглянути заплановані нагадування`;

export class SubscribeCommandHandler {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  register(bot: Bot): void {
    bot.command(['start', 'subscribe'], async (ctx) => {
      await this.subscriptionService.subscribe(ctx.chat.id);
      await ctx.reply(WELCOME_MESSAGE);
    });

    bot.command('unsubscribe', async (ctx) => {
      await this.subscriptionService.unsubscribe(ctx.chat.id);
      await ctx.reply('Відписано від афіші. Повернутися можна командою /subscribe.');
    });
  }
}

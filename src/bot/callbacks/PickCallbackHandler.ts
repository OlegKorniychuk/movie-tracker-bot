import type { Bot } from 'grammy';
import type { PickService } from '../../services/PickService.js';
import { BotEventHandler } from '../botEventHandler.js';

export class PickCallbackHandler implements BotEventHandler {
  constructor(private readonly pickService: PickService) {}

  register(bot: Bot): void {
    bot.callbackQuery(/^pick:(\d+)$/, async (ctx) => {
      if (!ctx.chat) {
        await ctx.answerCallbackQuery();
        return;
      }

      const movieId = Number(ctx.match[1]);
      await this.pickService.pick(ctx.chat.id, movieId);
      await ctx.answerCallbackQuery({ text: "Нагадаємо у день прем'єри ✅" });
    });
  }
}

import type { Bot } from 'grammy';
import type { PickService } from '../../services/PickService.js';

export class CancelCallbackHandler {
  constructor(private readonly pickService: PickService) {}

  register(bot: Bot): void {
    bot.callbackQuery(/^cancel:(\d+)$/, async (ctx) => {
      if (!ctx.chat) {
        await ctx.answerCallbackQuery();
        return;
      }

      const pickId = Number(ctx.match[1]);
      await this.pickService.cancel(pickId, ctx.chat.id);
      await ctx.answerCallbackQuery({ text: 'Скасовано' });
    });
  }
}

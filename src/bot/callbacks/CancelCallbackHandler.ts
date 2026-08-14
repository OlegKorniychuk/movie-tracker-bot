import type { Bot } from 'grammy';
import type { PickService } from '../../services/PickService.js';
import { BotEventHandler } from '../botEventHandler.js';

export class CancelCallbackHandler implements BotEventHandler {
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

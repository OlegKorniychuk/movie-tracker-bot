import type { Bot } from 'grammy';
import type { PickService } from '../../services/PickService.js';
import { BotEventHandler } from '../botEventHandler.js';
import { messages } from '../messages.js';
import type { TelegramBotApp } from '../TelegramBotApp.js';

export class CancelCallbackHandler implements BotEventHandler {
  constructor(
    private readonly pickService: PickService,
    private readonly telegramBotApp: TelegramBotApp,
  ) {}

  register(bot: Bot): void {
    bot.callbackQuery(/^cancel:(\d+)$/, async (ctx) => {
      if (!ctx.chat) {
        await ctx.answerCallbackQuery();
        return;
      }

      const pickId = Number(ctx.match[1]);
      await this.pickService.cancel(pickId, ctx.chat.id);
      await ctx.answerCallbackQuery({ text: messages.cancelConfirmed });
      await this.telegramBotApp.sendMessage(ctx.chat.id, messages.cancelConfirmed);
    });
  }
}

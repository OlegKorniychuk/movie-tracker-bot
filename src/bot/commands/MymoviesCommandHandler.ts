import { InlineKeyboard, type Bot } from 'grammy';
import type { PickService } from '../../services/PickService.js';
import { BotEventHandler } from '../botEventHandler.js';
import { messages } from '../messages.js';
import type { TelegramBotApp } from '../TelegramBotApp.js';

export class MymoviesCommandHandler implements BotEventHandler {
  constructor(
    private readonly pickService: PickService,
    private readonly telegramBotApp: TelegramBotApp,
  ) {}

  register(bot: Bot): void {
    bot.command('mymovies', async (ctx) => {
      if (!ctx.chat) return;

      const picks = await this.pickService.listActive(ctx.chat.id);

      if (picks.length === 0) {
        await this.telegramBotApp.sendMessage(ctx.chat.id, messages.noPicks);
        return;
      }

      for (const pick of picks) {
        const keyboard = new InlineKeyboard().text('❌ Скасувати', `cancel:${pick.pickId}`);
        await this.telegramBotApp.sendMessage(
          ctx.chat.id,
          messages.myMoviesEntry(pick.uaTitle, pick.releaseDate),
          { keyboard },
        );
      }
    });
  }
}

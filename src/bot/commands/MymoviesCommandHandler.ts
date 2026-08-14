import { InlineKeyboard, type Bot } from 'grammy';
import type { PickService } from '../../services/PickService.js';
import { BotEventHandler } from '../botEventHandler.js';
import { messages } from '../messages.js';

export class MymoviesCommandHandler implements BotEventHandler {
  constructor(private readonly pickService: PickService) {}

  register(bot: Bot): void {
    bot.command('mymovies', async (ctx) => {
      if (!ctx.chat) return;

      const picks = await this.pickService.listActive(ctx.chat.id);

      if (picks.length === 0) {
        await ctx.reply(messages.noPicks);
        return;
      }

      for (const pick of picks) {
        const keyboard = new InlineKeyboard().text('❌ Скасувати', `cancel:${pick.pickId}`);
        await ctx.reply(messages.myMoviesEntry(pick.uaTitle, pick.releaseDate), {
          reply_markup: keyboard,
        });
      }
    });
  }
}

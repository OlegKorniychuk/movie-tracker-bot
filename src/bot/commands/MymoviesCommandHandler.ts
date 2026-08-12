import { InlineKeyboard, type Bot } from 'grammy';
import { formatReleaseDate } from '../../formatDate.js';
import type { PickService } from '../../services/PickService.js';

const NO_PICKS_MESSAGE =
  'Немає запланованих нагадувань. Обирайте фільми з афіші кнопкою «🎬 Хочу подивитись».';

export class MymoviesCommandHandler {
  constructor(private readonly pickService: PickService) {}

  register(bot: Bot): void {
    bot.command('mymovies', async (ctx) => {
      if (!ctx.chat) return;

      const picks = await this.pickService.listActive(ctx.chat.id);

      if (picks.length === 0) {
        await ctx.reply(NO_PICKS_MESSAGE);
        return;
      }

      for (const pick of picks) {
        const keyboard = new InlineKeyboard().text('❌ Скасувати', `cancel:${pick.pickId}`);
        await ctx.reply(`🎬 ${pick.uaTitle}\n📅 ${formatReleaseDate(pick.releaseDate)}`, {
          reply_markup: keyboard,
        });
      }
    });
  }
}

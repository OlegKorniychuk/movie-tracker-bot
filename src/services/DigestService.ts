import type { Bot } from 'grammy';
import { DigestMessageFormatter } from '../bot/DigestMessageFormatter.js';
import type { Movie } from '../domain/Movie.js';
import { DigestStateRepository } from '../repositories/DigestStateRepository.js';
import { MovieRepository } from '../repositories/MovieRepository.js';
import { SubscriptionRepository } from '../repositories/SubscriptionRepository.js';
import { MovieAggregationService } from './MovieAggregationService.js';

const DIGEST_INTERVAL_DAYS = 14;
const DIGEST_WINDOW_DAYS = 28;
const SEND_DELAY_MS = 350; // stay well under Telegram's per-chat rate limit
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class DigestService {
  constructor(
    private readonly movieRepo: MovieRepository,
    private readonly subscriptionRepo: SubscriptionRepository,
    private readonly digestStateRepo: DigestStateRepository,
    private readonly aggregationService: MovieAggregationService,
    private readonly bot: Bot,
    private readonly formatter: DigestMessageFormatter,
  ) {}

  async run(): Promise<void> {
    const lastDigestAt = await this.digestStateRepo.getLastDigestAt();
    if (lastDigestAt !== null && this.daysSince(lastDigestAt) < DIGEST_INTERVAL_DAYS) {
      console.log(
        `Digest gated: last run ${lastDigestAt}, ${this.daysSince(lastDigestAt).toFixed(1)} days ago`,
      );
      return;
    }

    const merged = await this.aggregationService.fetchAndMerge();
    await this.movieRepo.upsertMany(merged);

    const windowEnd = this.isoDateDaysFromNow(DIGEST_WINDOW_DAYS);
    const newMovies = await this.movieRepo.findUndigestedInWindow(windowEnd);

    const now = new Date().toISOString();

    if (newMovies.length === 0) {
      console.log('Digest: no new movies in window to send');
      await this.digestStateRepo.setLastDigestAt(now);
      return;
    }

    const subscriberChatIds = await this.subscriptionRepo.list();
    if (subscriberChatIds.length === 0) {
      // Nobody to send to — leave these movies undigested so whoever
      // subscribes later still gets them, instead of silently losing them.
      console.log('Digest: no subscribers, leaving fetched movies undigested');
      await this.digestStateRepo.setLastDigestAt(now);
      return;
    }

    for (const chatId of subscriberChatIds) {
      for (const movie of newMovies) {
        await this.sendDigestMovie(chatId, movie);
        await this.sleep(SEND_DELAY_MS);
      }
    }

    const digestedIds = newMovies
      .map((movie) => movie.id)
      .filter((id): id is number => id !== null);
    await this.movieRepo.markDigested(digestedIds, now);
    await this.digestStateRepo.setLastDigestAt(now);
  }

  private async sendDigestMovie(chatId: number, movie: Movie): Promise<void> {
    if (movie.id === null) return; // movies read back from the DB always have an id
    const caption = this.formatter.formatCaption(movie);
    const keyboard = this.formatter.buildKeyboard(movie.id);
    try {
      if (movie.posterUrl) {
        await this.bot.api.sendPhoto(chatId, movie.posterUrl, {
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
      } else {
        await this.bot.api.sendMessage(chatId, caption, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
      }
    } catch (err) {
      console.error(`Failed to send digest movie ${movie.id} to chat ${chatId}:`, err);
    }
  }

  private daysSince(isoDateTime: string): number {
    return (Date.now() - new Date(isoDateTime).getTime()) / MS_PER_DAY;
  }

  private isoDateDaysFromNow(days: number): string {
    return new Date(Date.now() + days * MS_PER_DAY).toISOString().slice(0, 10);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

import { DigestMessageFormatter } from '../bot/DigestMessageFormatter.js';
import type { TelegramBotApp } from '../bot/TelegramBotApp.js';
import type { Movie } from '../domain/Movie.js';
import type { Logger } from '../logging/Logger.js';
import { DigestStateRepository } from '../repositories/DigestStateRepository.js';
import { MovieRepository } from '../repositories/MovieRepository.js';
import { SubscriptionRepository } from '../repositories/SubscriptionRepository.js';
import { MovieSourceService } from './MovieSourceService.js';

const DIGEST_INTERVAL_DAYS = 14;
const DIGEST_WINDOW_DAYS = 14;
const SEND_DELAY_MS = 350; // stay well under Telegram's per-chat rate limit
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class DigestService {
  constructor(
    private readonly movieRepo: MovieRepository,
    private readonly subscriptionRepo: SubscriptionRepository,
    private readonly digestStateRepo: DigestStateRepository,
    private readonly sourceService: MovieSourceService,
    private readonly telegramBotApp: TelegramBotApp,
    private readonly formatter: DigestMessageFormatter,
    private readonly logger: Logger,
  ) {}

  async run(): Promise<void> {
    const lastDigestAt = await this.digestStateRepo.getLastDigestAt();
    if (lastDigestAt !== null && this.daysSince(lastDigestAt) < DIGEST_INTERVAL_DAYS) {
      this.logger.info('Digest gated', {
        lastDigestAt,
        daysSince: Number(this.daysSince(lastDigestAt).toFixed(1)),
      });
      return;
    }

    const windowEnd = this.isoDateDaysFromNow(DIGEST_WINDOW_DAYS);
    const fetched = await this.sourceService.fetchUpcoming(windowEnd);
    await this.movieRepo.upsertMany(fetched);

    const newMovies = await this.movieRepo.findUndigestedInWindow(windowEnd);

    const now = new Date().toISOString();

    if (newMovies.length === 0) {
      this.logger.info('Digest: no new movies in window to send');
      await this.digestStateRepo.setLastDigestAt(now);
      return;
    }

    const subscriberChatIds = await this.subscriptionRepo.list();
    if (subscriberChatIds.length === 0) {
      // Nobody to send to — leave these movies undigested so whoever
      // subscribes later still gets them, instead of silently losing them.
      this.logger.info('Digest: no subscribers, leaving fetched movies undigested');
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
      await this.telegramBotApp.sendMessage(chatId, caption, {
        photoUrl: movie.posterUrl,
        keyboard,
      });
    } catch (err) {
      this.logger.error('Failed to send digest movie', { movieId: movie.id, chatId, error: err });
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

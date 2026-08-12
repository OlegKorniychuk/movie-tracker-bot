import { InlineKeyboard } from 'grammy';
import type { Movie } from '../domain/Movie.js';
import { escapeHtml } from '../escapeHtml.js';
import { formatReleaseDate } from '../formatDate.js';

export class DigestMessageFormatter {
  private static readonly CAST_DISPLAY_LIMIT = 5;
  private static readonly CAPTION_LIMIT = 1024;

  formatCaption(movie: Movie): string {
    const header = movie.originalTitle !== movie.uaTitle ? escapeHtml(movie.originalTitle) : null;
    const meta = [movie.countries.join(', '), movie.year !== null ? String(movie.year) : null]
      .filter(Boolean)
      .join(' • ');
    const rating = movie.imdbRating !== null ? `⭐ IMDb: ${movie.imdbRating}` : null;
    const cast =
      movie.cast.length > 0
        ? `🎭 ${movie.cast
            .slice(0, DigestMessageFormatter.CAST_DISPLAY_LIMIT)
            .map((c) => escapeHtml(c.name))
            .join(', ')}`
        : null;
    const releaseDateLine = movie.releaseDate
      ? `📅 У кіно з ${formatReleaseDate(movie.releaseDate)}`
      : null;

    const lines = [
      `🎬 <b>${escapeHtml(movie.uaTitle)}</b>`,
      header,
      [meta, rating].filter(Boolean).join('  ') || null,
      cast,
      movie.shortDescription ? escapeHtml(movie.shortDescription) : null,
      releaseDateLine,
    ].filter((line): line is string => line !== null && line !== '');

    let caption = lines.join('\n\n');
    if (caption.length > DigestMessageFormatter.CAPTION_LIMIT) {
      caption = `${caption.slice(0, DigestMessageFormatter.CAPTION_LIMIT - 1)}…`;
    }
    return caption;
  }

  buildKeyboard(movieId: number): InlineKeyboard {
    return new InlineKeyboard().text('🎬 Хочу подивитись', `pick:${movieId}`);
  }
}

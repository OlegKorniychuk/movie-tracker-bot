import { InlineKeyboard } from 'grammy';
import type { movies } from '../db/schema.js';
import { escapeHtml } from '../escapeHtml.js';
import { formatReleaseDate } from '../formatDate.js';

type MovieRow = typeof movies.$inferSelect;

const CAST_DISPLAY_LIMIT = 5;
const CAPTION_LIMIT = 1024;

export function formatDigestCaption(movie: MovieRow): string {
  const header = movie.originalTitle !== movie.uaTitle ? escapeHtml(movie.originalTitle) : null;
  const meta = [movie.countries.join(', '), String(movie.year)].filter(Boolean).join(' • ');
  const rating = movie.imdbRating !== null ? `⭐ IMDb: ${movie.imdbRating}` : null;
  const cast =
    movie.cast.length > 0
      ? `🎭 ${movie.cast
          .slice(0, CAST_DISPLAY_LIMIT)
          .map((c) => escapeHtml(c.name))
          .join(', ')}`
      : null;

  const lines = [
    `🎬 <b>${escapeHtml(movie.uaTitle)}</b>`,
    header,
    [meta, rating].filter(Boolean).join('  ') || null,
    cast,
    movie.shortDescription ? escapeHtml(movie.shortDescription) : null,
    `📅 У кіно з ${formatReleaseDate(movie.releaseDate)}`,
  ].filter((line): line is string => line !== null && line !== '');

  let caption = lines.join('\n\n');
  if (caption.length > CAPTION_LIMIT) {
    caption = `${caption.slice(0, CAPTION_LIMIT - 1)}…`;
  }
  return caption;
}

export function digestKeyboard(movieId: number): InlineKeyboard {
  return new InlineKeyboard().text('🎬 Хочу подивитись', `pick:${movieId}`);
}

import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { CastMember } from '../domain/Movie.js';

export const movies = sqliteTable(
  'movies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    normalizedTitle: text('normalized_title').notNull(),
    originalTitle: text('original_title').notNull(),
    uaTitle: text('ua_title').notNull(),
    year: integer('year').notNull(),
    countries: text('countries', { mode: 'json' }).$type<string[]>().notNull(),
    shortDescription: text('short_description'),
    posterUrl: text('poster_url'),
    imdbRating: real('imdb_rating'),
    cast: text('cast', { mode: 'json' }).$type<CastMember[]>().notNull(),
    releaseDate: text('release_date').notNull(),
    digestedAt: text('digested_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [uniqueIndex('movies_normalized_title_idx').on(table.normalizedTitle)],
);

export const subscriptions = sqliteTable('subscriptions', {
  chatId: integer('chat_id').primaryKey(),
  subscribedAt: text('subscribed_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const trackedPicks = sqliteTable(
  'tracked_picks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chatId: integer('chat_id').notNull(),
    movieId: integer('movie_id')
      .notNull()
      .references(() => movies.id),
    pickedAt: text('picked_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    notifiedAt: text('notified_at'),
    cancelledAt: text('cancelled_at'),
  },
  (table) => [uniqueIndex('tracked_picks_chat_movie_idx').on(table.chatId, table.movieId)],
);

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

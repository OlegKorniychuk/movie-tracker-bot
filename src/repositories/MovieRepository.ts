import { and, inArray, isNull, lte } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { movies as moviesTable } from '../db/schema.js';
import { Movie } from '../domain/Movie.js';

// D1 caps bound parameters per query at 100 (well below vanilla SQLite's
// 999), so a single `inArray`/batch over the full movie count blows past it.
const D1_PARAM_CHUNK_SIZE = 90;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export interface UpsertResult {
  inserted: Movie[];
  updated: Movie[];
}

export class MovieRepository {
  constructor(private readonly db: Db) {}

  // Movies with no release date can't be tracked (nothing to dedupe the
  // digest against, nothing to remind on) — skipped rather than persisted.
  async upsertMany(movies: Movie[]): Promise<UpsertResult> {
    const withDate = movies.filter((movie): movie is Movie & { releaseDate: string } => {
      if (movie.releaseDate === null) {
        console.warn(`Skipping movie with no release date: "${movie.originalTitle}"`);
        return false;
      }
      return true;
    });

    if (withDate.length === 0) return { inserted: [], updated: [] };

    const keys = withDate.map((movie) => movie.normalizedTitle());
    const existingKeys = new Set<string>();
    for (const keyChunk of chunk(keys, D1_PARAM_CHUNK_SIZE)) {
      const rows = await this.db
        .select({ normalizedTitle: moviesTable.normalizedTitle })
        .from(moviesTable)
        .where(inArray(moviesTable.normalizedTitle, keyChunk));
      for (const row of rows) existingKeys.add(row.normalizedTitle);
    }

    const inserted: Movie[] = [];
    const updated: Movie[] = [];
    for (const movie of withDate) {
      const target = existingKeys.has(movie.normalizedTitle()) ? updated : inserted;
      target.push(movie);
    }

    const upsertQueries = withDate.map((movie) => {
      const row = this.toRow(movie);
      return this.db.insert(moviesTable).values(row).onConflictDoUpdate({
        target: moviesTable.normalizedTitle,
        set: row,
      });
    });
    for (const queryChunk of chunk(upsertQueries, D1_PARAM_CHUNK_SIZE)) {
      const [first, ...rest] = queryChunk;
      if (first) await this.db.batch([first, ...rest]);
    }

    return { inserted, updated };
  }

  async findUndigestedInWindow(windowEndIso: string): Promise<Movie[]> {
    const rows = await this.db
      .select()
      .from(moviesTable)
      .where(and(isNull(moviesTable.digestedAt), lte(moviesTable.releaseDate, windowEndIso)));
    return rows.map((row) => this.rowToMovie(row));
  }

  // Not chunked — preserved as-is from the original implementation. Digest
  // batches have stayed well under 100 movies in practice; if that changes,
  // this needs the same chunking as upsertMany's existence check.
  async markDigested(ids: number[], isoNow: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(moviesTable)
      .set({ digestedAt: isoNow })
      .where(inArray(moviesTable.id, ids));
  }

  private toRow(movie: Movie & { releaseDate: string }) {
    return {
      normalizedTitle: movie.normalizedTitle(),
      originalTitle: movie.originalTitle,
      uaTitle: movie.uaTitle,
      year: movie.year ?? Number(movie.releaseDate.slice(0, 4)),
      countries: movie.countries,
      shortDescription: movie.shortDescription,
      posterUrl: movie.posterUrl,
      imdbRating: movie.imdbRating,
      cast: movie.cast,
      releaseDate: movie.releaseDate,
    };
  }

  private rowToMovie(row: typeof moviesTable.$inferSelect): Movie {
    return new Movie({
      id: row.id,
      uaTitle: row.uaTitle,
      originalTitle: row.originalTitle,
      year: row.year,
      countries: row.countries,
      shortDescription: row.shortDescription,
      posterUrl: row.posterUrl,
      imdbRating: row.imdbRating,
      cast: row.cast,
      releaseDate: row.releaseDate,
    });
  }
}

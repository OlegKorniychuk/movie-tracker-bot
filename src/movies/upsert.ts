import { inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { movies as moviesTable } from '../db/schema.js';
import { normalizeTitle } from '../normalizeTitle.js';
import type { Movie } from '../sources/types.js';

type MovieWithDate = Movie & { releaseDate: string };

// D1 caps bound parameters per query at 100 (well below vanilla SQLite's
// 999), so a single `inArray` with our full movie count blows past it.
const D1_PARAM_CHUNK_SIZE = 90;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function toRow(movie: MovieWithDate) {
  return {
    normalizedTitle: normalizeTitle(movie.originalTitle),
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

export interface UpsertResult {
  inserted: Movie[];
  updated: Movie[];
}

// Movies with no release date can't be tracked (nothing to dedupe the digest
// against, nothing to remind on) — skipped rather than persisted.
export async function upsertMovies(db: Db, movies: Movie[]): Promise<UpsertResult> {
  const withDate = movies.filter((movie): movie is MovieWithDate => {
    if (movie.releaseDate === null) {
      console.warn(`Skipping movie with no release date: "${movie.originalTitle}"`);
      return false;
    }
    return true;
  });

  if (withDate.length === 0) return { inserted: [], updated: [] };

  const keys = withDate.map((movie) => normalizeTitle(movie.originalTitle));
  const existingKeys = new Set<string>();
  for (const keyChunk of chunk(keys, D1_PARAM_CHUNK_SIZE)) {
    const rows = await db
      .select({ normalizedTitle: moviesTable.normalizedTitle })
      .from(moviesTable)
      .where(inArray(moviesTable.normalizedTitle, keyChunk));
    for (const row of rows) existingKeys.add(row.normalizedTitle);
  }

  const inserted: Movie[] = [];
  const updated: Movie[] = [];
  for (const movie of withDate) {
    const target = existingKeys.has(normalizeTitle(movie.originalTitle)) ? updated : inserted;
    target.push(movie);
  }

  const upsertQueries = withDate.map((movie) => {
    const row = toRow(movie);
    return db.insert(moviesTable).values(row).onConflictDoUpdate({
      target: moviesTable.normalizedTitle,
      set: row,
    });
  });
  for (const queryChunk of chunk(upsertQueries, D1_PARAM_CHUNK_SIZE)) {
    const [first, ...rest] = queryChunk;
    if (first) await db.batch([first, ...rest]);
  }

  return { inserted, updated };
}

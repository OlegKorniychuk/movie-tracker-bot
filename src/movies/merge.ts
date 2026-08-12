import { mapWithConcurrency } from '../mapWithConcurrency.js';
import { normalizeTitle } from '../normalizeTitle.js';
import { enrichFromTmdb } from '../sources/tmdb.js';
import type { Movie } from '../sources/types.js';

const ENRICH_CONCURRENCY = 5;

// Keyed on title alone, not (title, year) — Planetakino's `year` is the
// production year, Multiplex's is the UA release year, and they routinely
// disagree by one for the same movie (confirmed live: "Arco" is 2025 on
// Planetakino, 2026 on Multiplex, identical release date). Two unrelated
// films sharing an exact original title within the same few-week digest
// window is far less likely than that mismatch recurring.
function movieKey(movie: Movie): string {
  return normalizeTitle(movie.originalTitle);
}

function needsEnrichment(movie: Movie): boolean {
  return (
    movie.shortDescription === null ||
    movie.posterUrl === null ||
    movie.countries.length === 0 ||
    movie.cast.length === 0
  );
}

// Planetakino (primary) wins on a key collision; Multiplex (fallback) only
// fills in movies Planetakino doesn't have. TMDB enrichment runs last, and
// only for whatever's still missing after that merge.
export async function mergeMovieSources(
  planetakino: Movie[],
  multiplex: Movie[],
  tmdbApiKey: string,
): Promise<Movie[]> {
  const byKey = new Map<string, Movie>();

  for (const movie of planetakino) {
    byKey.set(movieKey(movie), movie);
  }
  for (const movie of multiplex) {
    const key = movieKey(movie);
    if (!byKey.has(key)) byKey.set(key, movie);
  }

  const merged = Array.from(byKey.values());
  return mapWithConcurrency(merged, ENRICH_CONCURRENCY, (movie) =>
    needsEnrichment(movie) ? enrichFromTmdb(tmdbApiKey, movie) : Promise.resolve(movie),
  );
}

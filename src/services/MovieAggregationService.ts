import type { Movie } from '../domain/Movie.js';
import { mapWithConcurrency } from '../mapWithConcurrency.js';
import type { MovieEnricher } from '../providers/MovieEnricher.js';
import type { MovieSource } from '../providers/MovieSource.js';

// Sources are ordered by trust: the first source wins unconditionally on a
// collision (including collisions within its own results), every source
// after that only fills gaps the earlier ones didn't cover. Keyed on title
// alone, not (title, year) — Planetakino's `year` is the production year,
// Multiplex's is the UA release year, and they routinely disagree by one for
// the same movie (confirmed live: "Arco" is 2025 on Planetakino, 2026 on
// Multiplex, identical release date). Two unrelated films sharing an exact
// original title within the same few-week digest window is far less likely
// than that mismatch recurring.
export class MovieAggregationService {
  private static readonly ENRICH_CONCURRENCY = 5;

  constructor(
    private readonly sources: MovieSource[],
    private readonly enricher: MovieEnricher,
  ) {}

  async fetchAndMerge(): Promise<Movie[]> {
    const fetchedBySource = await Promise.all(this.sources.map((source) => source.fetchUpcoming()));

    const byKey = new Map<string, Movie>();
    fetchedBySource.forEach((movies, sourceIndex) => {
      const isPrimarySource = sourceIndex === 0;
      for (const movie of movies) {
        const key = movie.normalizedTitle();
        if (isPrimarySource || !byKey.has(key)) {
          byKey.set(key, movie);
        }
      }
    });

    const merged = Array.from(byKey.values());
    return mapWithConcurrency(merged, MovieAggregationService.ENRICH_CONCURRENCY, (movie) =>
      movie.needsEnrichment() ? this.enricher.enrich(movie) : Promise.resolve(movie),
    );
  }
}

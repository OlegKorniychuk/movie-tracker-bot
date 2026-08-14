import type { Movie } from '../domain/Movie.js';
import type { MovieSource } from '../providers/MovieSource.js';

// Sources are tried in order: the first is the real data source (Planetakino
// — a rich GraphQL feed with no per-movie request cost), the rest are only
// hit if an earlier one throws (Multiplex — a fragile per-movie HTML scrape,
// kept only as a fallback of last resort). No merging: on success a source's
// result is used as-is, nothing from a lower-priority source is mixed in.
export class MovieSourceService {
  constructor(private readonly sources: MovieSource[]) {}

  async fetchUpcoming(windowEnd: string): Promise<Movie[]> {
    let lastError: unknown;

    for (const [index, source] of this.sources.entries()) {
      try {
        return await source.fetchUpcoming(windowEnd);
      } catch (err) {
        lastError = err;
        console.warn(
          `Movie source ${source.constructor.name} failed (${(err as Error).message}); ` +
            (index + 1 < this.sources.length ? 'falling back to next source' : 'no sources left'),
        );
      }
    }

    throw new Error(`All movie sources failed: ${(lastError as Error)?.message}`);
  }
}

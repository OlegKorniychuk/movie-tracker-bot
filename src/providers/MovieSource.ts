import type { Movie } from '../domain/Movie.js';

export interface MovieSource {
  // windowEnd is an ISO YYYY-MM-DD date; sources that can cheaply bound their
  // own request count against it (e.g. per-movie detail-page scrapers) should.
  fetchUpcoming(windowEnd: string): Promise<Movie[]>;
}

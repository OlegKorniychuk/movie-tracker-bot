import type { Movie } from '../domain/Movie.js';

export interface MovieEnricher {
  enrich(movie: Movie): Promise<Movie>;
}

import type { Movie } from '../domain/Movie.js';

export interface MovieSource {
  fetchUpcoming(): Promise<Movie[]>;
}

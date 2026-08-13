import type { CastMember, Movie } from '../domain/Movie.js';
import type { MovieEnricher } from './MovieEnricher.js';

interface SearchResponse {
  results: { id: number }[];
}

interface MovieDetailsResponse {
  overview: string | null;
  poster_path: string | null;
  production_countries: { iso_3166_1: string }[];
}

interface MovieDetails {
  shortDescription: string | null;
  posterUrl: string | null;
  countries: string[];
}

interface CreditsResponse {
  cast: { name: string }[];
  crew: { name: string; job: string }[];
}

// Only fills fields Planetakino/Multiplex left empty — never touches
// releaseDate (TMDB's UA coverage is unreliable, see
// docs/ideas/tmdb-release-date-validation.md) or imdbRating (TMDB's
// vote_average is a different metric, not a real IMDb score). Movie's own
// mergeEnrichment() makes that a type-level guarantee, not just a comment.
export class TmdbEnricher implements MovieEnricher {
  private static readonly BASE_URL = 'https://api.themoviedb.org/3';
  private static readonly IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
  private static readonly CAST_LIMIT = 10;

  constructor(private readonly apiKey: string) {}

  async enrich(movie: Movie): Promise<Movie> {
    const missingDescription = movie.shortDescription === null;
    const missingPoster = movie.posterUrl === null;
    const missingCountries = movie.countries.length === 0;
    const missingCast = movie.cast.length === 0;

    if (!missingDescription && !missingPoster && !missingCountries && !missingCast) {
      return movie;
    }

    try {
      const movieId = await this.searchMovieId(movie.originalTitle, movie.year);
      if (movieId === null) return movie;

      let enriched = movie;

      if (missingDescription || missingPoster || missingCountries) {
        const details = await this.getMovieDetails(movieId);
        enriched = enriched.mergeEnrichment({
          shortDescription: details.shortDescription,
          posterUrl: details.posterUrl,
          countries: details.countries,
        });
      }

      if (missingCast) {
        enriched = enriched.mergeEnrichment({ cast: await this.getCredits(movieId) });
      }

      return enriched;
    } catch (err) {
      console.warn(
        `TMDB enrichment failed for "${movie.originalTitle}": ${(err as Error).message}`,
      );
      return movie;
    }
  }

  private async searchMovieId(originalTitle: string, year: number | null): Promise<number | null> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      query: originalTitle,
      include_adult: 'false',
      language: 'uk-UA',
    });
    if (year !== null) params.set('year', String(year));

    const response = await fetch(`${TmdbEnricher.BASE_URL}/search/movie?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`TMDB search request failed: ${response.status}`);
    }
    const data: SearchResponse = await response.json();
    return data.results[0]?.id ?? null;
  }

  private async getMovieDetails(movieId: number): Promise<MovieDetails> {
    const response = await fetch(
      `${TmdbEnricher.BASE_URL}/movie/${movieId}?api_key=${this.apiKey}&language=uk-UA`,
    );
    if (!response.ok) {
      throw new Error(`TMDB movie details request for ${movieId} failed: ${response.status}`);
    }
    const data: MovieDetailsResponse = await response.json();
    return {
      shortDescription: data.overview,
      posterUrl: data.poster_path ? `${TmdbEnricher.IMAGE_BASE_URL}${data.poster_path}` : null,
      countries: data.production_countries.map((c) => c.iso_3166_1),
    };
  }

  private async getCredits(movieId: number): Promise<CastMember[]> {
    const response = await fetch(
      `${TmdbEnricher.BASE_URL}/movie/${movieId}/credits?api_key=${this.apiKey}`,
    );
    if (!response.ok) {
      throw new Error(`TMDB credits request for ${movieId} failed: ${response.status}`);
    }
    const data: CreditsResponse = await response.json();
    const directors = data.crew
      .filter((c) => c.job === 'Director')
      .map((c) => ({ name: c.name, role: 'Режисер' }));
    const cast = data.cast
      .slice(0, TmdbEnricher.CAST_LIMIT)
      .map((c) => ({ name: c.name, role: 'Актор' }));
    return [...directors, ...cast];
  }
}

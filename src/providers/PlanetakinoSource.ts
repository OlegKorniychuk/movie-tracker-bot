import { Movie, type CastMember } from '../domain/Movie.js';
import type { MovieSource } from './MovieSource.js';

interface PlanetakinoNode {
  name: string;
  originalName: string | null;
  year: number | null;
  countries: string[];
  shortDescription: string | null;
  posters: { vertical: { url: string }[] };
  rating: { imdb: { rating: number | null } };
  credits: { nodes: { roles: { name: string }[]; person: { name: string } }[] };
  offlineRental: { start: string | null } | null;
}

interface PlanetakinoResponse {
  data?: {
    movies: {
      totalCount: number;
      nodes: PlanetakinoNode[];
    };
  };
  errors?: { message: string }[];
}

export class PlanetakinoSource implements MovieSource {
  private static readonly ENDPOINT = 'https://api-mobile.planetakino.ua/graphql/movies';

  // Kyiv (Lavina) — used only as a screening-date sample; Planetakino has no
  // nationwide "coming soon" endpoint, offlineRental dates are per-cinema.
  private static readonly DEFAULT_CINEMA_ID = 'Z2lkOi8vY2luZW1hLzI=';

  private static readonly PAGE_SIZE = 50;
  private static readonly CREDITS_PAGE_SIZE = 20;

  private static readonly QUERY = `
query movies($first: Int $skip: Int $statusOffline: [MovieStatusOffline!] $cinemaId: String! $creditsFirst: Int) {
  movies(first: $first skip: $skip statusOffline: $statusOffline cinemaId: $cinemaId) {
    totalCount
    nodes {
      name
      originalName
      year
      countries
      shortDescription
      posters {
        vertical {
          url
        }
      }
      rating {
        imdb {
          rating
        }
      }
      credits(first: $creditsFirst) {
        nodes {
          roles {
            name
          }
          person {
            name
          }
        }
      }
      offlineRental(cinemaId: $cinemaId) {
        start
      }
    }
  }
}
`;

  constructor(private readonly cinemaId: string = PlanetakinoSource.DEFAULT_CINEMA_ID) {}

  // windowEnd unused: GraphQL pagination already costs ~3 requests regardless
  // of how many movies are in range, so there's nothing to bound here.
  async fetchUpcoming(_windowEnd: string): Promise<Movie[]> {
    const movies: Movie[] = [];
    let skip = 0;
    let totalCount = Infinity;

    while (skip < totalCount) {
      const response = await fetch(PlanetakinoSource.ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: PlanetakinoSource.QUERY,
          variables: {
            first: PlanetakinoSource.PAGE_SIZE,
            skip,
            statusOffline: 'PUBLISHED_AT_ANNOUNCED',
            cinemaId: this.cinemaId,
            creditsFirst: PlanetakinoSource.CREDITS_PAGE_SIZE,
          },
        }),
      });

      const result: PlanetakinoResponse = await response.json();
      if (result.errors) {
        throw new Error(
          `Planetakino GraphQL error: ${result.errors.map((e) => e.message).join('; ')}`,
        );
      }
      if (!result.data) {
        throw new Error('Planetakino GraphQL returned no data');
      }

      totalCount = result.data.movies.totalCount;
      for (const node of result.data.movies.nodes) {
        movies.push(this.toMovie(node));
      }

      skip += PlanetakinoSource.PAGE_SIZE;
    }

    return movies;
  }

  private toCast(node: PlanetakinoNode): CastMember[] {
    return node.credits.nodes.flatMap((credit) =>
      credit.roles.map((role) => ({ name: credit.person.name, role: role.name })),
    );
  }

  private toMovie(node: PlanetakinoNode): Movie {
    return new Movie({
      id: null,
      uaTitle: node.name,
      originalTitle: node.originalName ?? node.name,
      year: node.year,
      countries: node.countries,
      shortDescription: node.shortDescription,
      posterUrl: node.posters.vertical[0]?.url ?? null,
      imdbRating: node.rating.imdb.rating,
      cast: this.toCast(node),
      releaseDate: node.offlineRental?.start?.slice(0, 10) ?? null,
    });
  }
}

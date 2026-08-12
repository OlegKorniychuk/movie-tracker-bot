import type { CastMember, Movie } from './types.js';

const ENDPOINT = 'https://api-mobile.planetakino.ua/graphql/movies';

// Kyiv (Lavina) — used only as a screening-date sample; Planetakino has no
// nationwide "coming soon" endpoint, offlineRental dates are per-cinema.
const DEFAULT_CINEMA_ID = 'Z2lkOi8vY2luZW1hLzI=';

const CREDITS_PAGE_SIZE = 20;

const QUERY = `
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

function toCast(node: PlanetakinoNode): CastMember[] {
  return node.credits.nodes.flatMap((credit) =>
    credit.roles.map((role) => ({ name: credit.person.name, role: role.name })),
  );
}

function toMovie(node: PlanetakinoNode): Movie {
  return {
    uaTitle: node.name,
    originalTitle: node.originalName ?? node.name,
    year: node.year,
    countries: node.countries,
    shortDescription: node.shortDescription,
    posterUrl: node.posters.vertical[0]?.url ?? null,
    imdbRating: node.rating.imdb.rating,
    cast: toCast(node),
    releaseDate: node.offlineRental?.start?.slice(0, 10) ?? null,
  };
}

const PAGE_SIZE = 50;

export async function getPlanetakinoUpcoming(
  cinemaId: string = DEFAULT_CINEMA_ID,
): Promise<Movie[]> {
  const movies: Movie[] = [];
  let skip = 0;
  let totalCount = Infinity;

  while (skip < totalCount) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          first: PAGE_SIZE,
          skip,
          statusOffline: 'PUBLISHED_AT_ANNOUNCED',
          cinemaId,
          creditsFirst: CREDITS_PAGE_SIZE,
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
      movies.push(toMovie(node));
    }

    skip += PAGE_SIZE;
  }

  return movies;
}

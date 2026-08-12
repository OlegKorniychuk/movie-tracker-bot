export interface CastMember {
  name: string;
  role: string;
}

export interface Movie {
  uaTitle: string;
  originalTitle: string;
  year: number | null;
  countries: string[];
  shortDescription: string | null;
  posterUrl: string | null;
  imdbRating: number | null;
  cast: CastMember[];
  releaseDate: string | null;
}

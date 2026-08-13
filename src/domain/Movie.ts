import { normalizeTitle } from '../normalizeTitle.js';

export interface CastMember {
  name: string;
  role: string;
}

export interface MovieProps {
  id: number | null;
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

// Deliberately excludes releaseDate/imdbRating: TMDB enrichment must never
// touch either (its release-date and rating data were proven unreliable for
// this use case — see docs/ideas/tmdb-release-date-validation.md), and this
// type makes that a compile-time guarantee rather than a convention callers
// have to remember.
export interface EnrichmentFields {
  shortDescription?: string | null;
  posterUrl?: string | null;
  countries?: string[];
  cast?: CastMember[];
}

export class Movie {
  readonly id: number | null;
  readonly uaTitle: string;
  readonly originalTitle: string;
  readonly year: number | null;
  readonly countries: string[];
  readonly shortDescription: string | null;
  readonly posterUrl: string | null;
  readonly imdbRating: number | null;
  readonly cast: CastMember[];
  readonly releaseDate: string | null;

  constructor(props: MovieProps) {
    this.id = props.id;
    this.uaTitle = props.uaTitle;
    this.originalTitle = props.originalTitle;
    this.year = props.year;
    this.countries = props.countries;
    this.shortDescription = props.shortDescription;
    this.posterUrl = props.posterUrl;
    this.imdbRating = props.imdbRating;
    this.cast = props.cast;
    this.releaseDate = props.releaseDate;
  }

  needsEnrichment(): boolean {
    return (
      this.shortDescription === null ||
      this.posterUrl === null ||
      this.countries.length === 0 ||
      this.cast.length === 0
    );
  }

  normalizedTitle(): string {
    return normalizeTitle(this.originalTitle);
  }

  // Fills gaps only — a field that's already set on this movie is never
  // overwritten, regardless of what's passed in. Mirrors the source data's
  // trust order (Planetakino/Multiplex over TMDB) at the domain level, not
  // just at the call site.
  mergeEnrichment(fields: EnrichmentFields): Movie {
    return new Movie({
      id: this.id,
      uaTitle: this.uaTitle,
      originalTitle: this.originalTitle,
      year: this.year,
      releaseDate: this.releaseDate,
      imdbRating: this.imdbRating,
      shortDescription: this.shortDescription ?? fields.shortDescription ?? null,
      posterUrl: this.posterUrl ?? fields.posterUrl ?? null,
      countries: this.countries.length > 0 ? this.countries : (fields.countries ?? this.countries),
      cast: this.cast.length > 0 ? this.cast : (fields.cast ?? this.cast),
    });
  }
}

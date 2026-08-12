import * as cheerio from 'cheerio';
import { Movie, type CastMember } from '../domain/Movie.js';
import { mapWithConcurrency } from '../mapWithConcurrency.js';
import type { MovieSource } from './MovieSource.js';

const JSON_ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };

export class MultiplexSource implements MovieSource {
  private static readonly SOON_URL = 'https://multiplex.ua/soon';
  private static readonly MOVIE_URL = (id: string) => `https://multiplex.ua/movie/${id}`;
  private static readonly USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

  private static readonly DETAIL_PAGE_CONCURRENCY = 5;
  private static readonly COUNTRY_LABEL = 'Виробництво:';

  async fetchUpcoming(): Promise<Movie[]> {
    const ids = await this.getUpcomingMovieIds();
    const details = await mapWithConcurrency(ids, MultiplexSource.DETAIL_PAGE_CONCURRENCY, (id) =>
      this.getMovieDetail(id),
    );
    return details.filter((d): d is Movie => d !== null);
  }

  private async fetchHtml(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: { 'User-Agent': MultiplexSource.USER_AGENT },
    });
    if (!response.ok) {
      throw new Error(`Multiplex request to ${url} failed: ${response.status}`);
    }
    return response.text();
  }

  private async getUpcomingMovieIds(): Promise<string[]> {
    const html = await this.fetchHtml(MultiplexSource.SOON_URL);
    const $ = cheerio.load(html);
    const ids = new Set<string>();

    $('a.soon_fm').each((_, el) => {
      const href = $(el).attr('href');
      const id = href?.match(/\/movie\/(\d+)/)?.[1];
      if (id) ids.add(id);
    });

    return Array.from(ids);
  }

  // \uXXXX needs its own pass — a bare `\\(.)` replace would eat the backslash
  // and leave the 4 hex digits behind as literal text (e.g. "Бu0027єнвеню").
  private unescapeJsonString(raw: string): string {
    return raw.replace(
      /\\u([0-9a-fA-F]{4})|\\(.)/g,
      (_match, hex: string | undefined, char: string | undefined) => {
        if (hex !== undefined) return String.fromCharCode(parseInt(hex, 16));
        return (char !== undefined && JSON_ESCAPES[char]) || (char ?? '');
      },
    );
  }

  // The site's ld+json block isn't always valid JSON (e.g. missing commas
  // between array elements), so pull the few fields we need out by regex
  // instead of JSON.parse-ing the whole thing.
  private extractJsonLdField(block: string, field: string): string | null {
    const captured = block.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))?.[1];
    return captured ? this.unescapeJsonString(captured) : null;
  }

  // Grabs the raw text of a `"key": { ... }` or `"key": [ ... ]` value by
  // bracket-depth matching rather than JSON.parse, so it survives the same
  // malformed-JSON quirks extractJsonLdField is built to tolerate.
  private extractBalancedValue(
    block: string,
    key: string,
    open: '{' | '[',
    close: '}' | ']',
  ): string | null {
    const keyIndex = block.indexOf(`"${key}"`);
    if (keyIndex === -1) return null;
    const openIndex = block.indexOf(open, keyIndex);
    if (openIndex === -1) return null;

    let depth = 0;
    for (let i = openIndex; i < block.length; i++) {
      if (block[i] === open) depth++;
      else if (block[i] === close) {
        depth--;
        if (depth === 0) return block.slice(openIndex, i + 1);
      }
    }
    return null;
  }

  private extractAllNames(block: string): string[] {
    const names: string[] = [];
    const regex = /"name"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    for (const match of block.matchAll(regex)) {
      const captured = match[1];
      if (captured !== undefined) names.push(this.unescapeJsonString(captured));
    }
    return names;
  }

  // The site's own template breaks a single "name (filmography, credits)" bio
  // into a separate {"name": "..."} entry per comma inside the parenthetical —
  // e.g. one actor becomes 5 fake "Person" objects. Re-merge fragments until
  // the opened '(' is closed, then drop the parenthetical for a clean name.
  private mergeFragmentedNames(fragments: string[]): string[] {
    const merged: string[] = [];
    let current = '';

    for (const fragment of fragments) {
      current = current ? `${current}, ${fragment}` : fragment;
      const opens = (current.match(/\(/g) ?? []).length;
      const closes = (current.match(/\)/g) ?? []).length;
      if (opens <= closes) {
        merged.push(current);
        current = '';
      }
    }
    if (current) merged.push(current);

    return merged.map((name) => name.split('(')[0]?.trim() ?? name.trim());
  }

  private extractCast(block: string): CastMember[] {
    const directorBlock = this.extractBalancedValue(block, 'director', '{', '}');
    const actorBlock = this.extractBalancedValue(block, 'actor', '[', ']');
    return [
      ...(directorBlock ? this.mergeFragmentedNames(this.extractAllNames(directorBlock)) : []).map(
        (name) => ({ name, role: 'Режисер' }),
      ),
      ...(actorBlock ? this.mergeFragmentedNames(this.extractAllNames(actorBlock)) : []).map(
        (name) => ({ name, role: 'Актор' }),
      ),
    ];
  }

  // Country here is a Ukrainian display name (e.g. "США"), unlike Planetakino's
  // ISO codes — Multiplex only supplies this as free text, no code anywhere on
  // the page. Left as-is rather than mapped, since this source is a fallback.
  private extractCountry($: cheerio.CheerioAPI): string | null {
    const country = $('li')
      .filter((_, el) => $(el).find('p.key').text().trim() === MultiplexSource.COUNTRY_LABEL)
      .first()
      .find('p.val')
      .text()
      .trim();
    return country || null;
  }

  private async getMovieDetail(id: string): Promise<Movie | null> {
    let html: string;
    try {
      html = await this.fetchHtml(MultiplexSource.MOVIE_URL(id));
    } catch (err) {
      console.warn(`Skipping multiplex movie ${id}: ${(err as Error).message}`);
      return null;
    }

    const $ = cheerio.load(html);
    const block = $('script[type="application/ld+json"]').first().html();
    if (!block) return null;

    const name = this.extractJsonLdField(block, 'name');
    if (!name) return null;

    const originalTitle = this.extractJsonLdField(block, 'alternativeHeadline');
    const releaseDate = this.extractJsonLdField(block, 'dateCreated');
    const country = this.extractCountry($);

    return new Movie({
      id: null,
      uaTitle: name,
      originalTitle: originalTitle ?? name,
      year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
      countries: country ? [country] : [],
      shortDescription: this.extractJsonLdField(block, 'description'),
      posterUrl: this.extractJsonLdField(block, 'image'),
      imdbRating: null,
      cast: this.extractCast(block),
      releaseDate: releaseDate ?? null,
    });
  }
}

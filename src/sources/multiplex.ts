import * as cheerio from 'cheerio';
import { mapWithConcurrency } from '../mapWithConcurrency.js';
import type { CastMember, Movie } from './types.js';

const SOON_URL = 'https://multiplex.ua/soon';
const MOVIE_URL = (id: string) => `https://multiplex.ua/movie/${id}`;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const DETAIL_PAGE_CONCURRENCY = 5;
const COUNTRY_LABEL = 'Виробництво:';

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`Multiplex request to ${url} failed: ${response.status}`);
  }
  return response.text();
}

async function getUpcomingMovieIds(): Promise<string[]> {
  const html = await fetchHtml(SOON_URL);
  const $ = cheerio.load(html);
  const ids = new Set<string>();

  $('a.soon_fm').each((_, el) => {
    const href = $(el).attr('href');
    const id = href?.match(/\/movie\/(\d+)/)?.[1];
    if (id) ids.add(id);
  });

  return Array.from(ids);
}

const JSON_ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };

function unescapeJsonString(raw: string): string {
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
function extractJsonLdField(block: string, field: string): string | null {
  const captured = block.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))?.[1];
  return captured ? unescapeJsonString(captured) : null;
}

// Grabs the raw text of a `"key": { ... }` or `"key": [ ... ]` value by
// bracket-depth matching rather than JSON.parse, so it survives the same
// malformed-JSON quirks extractJsonLdField is built to tolerate.
function extractBalancedValue(
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

function extractAllNames(block: string): string[] {
  const names: string[] = [];
  const regex = /"name"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  for (const match of block.matchAll(regex)) {
    const captured = match[1];
    if (captured !== undefined) names.push(unescapeJsonString(captured));
  }
  return names;
}

// The site's own template breaks a single "name (filmography, credits)" bio
// into a separate {"name": "..."} entry per comma inside the parenthetical —
// e.g. one actor becomes 5 fake "Person" objects. Re-merge fragments until
// the opened '(' is closed, then drop the parenthetical for a clean name.
function mergeFragmentedNames(fragments: string[]): string[] {
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

function extractCast(block: string): CastMember[] {
  const directorBlock = extractBalancedValue(block, 'director', '{', '}');
  const actorBlock = extractBalancedValue(block, 'actor', '[', ']');
  return [
    ...(directorBlock ? mergeFragmentedNames(extractAllNames(directorBlock)) : []).map((name) => ({
      name,
      role: 'Режисер',
    })),
    ...(actorBlock ? mergeFragmentedNames(extractAllNames(actorBlock)) : []).map((name) => ({
      name,
      role: 'Актор',
    })),
  ];
}

// Country here is a Ukrainian display name (e.g. "США"), unlike Planetakino's
// ISO codes — Multiplex only supplies this as free text, no code anywhere on
// the page. Left as-is rather than mapped, since this source is a fallback.
function extractCountry($: cheerio.CheerioAPI): string | null {
  const country = $('li')
    .filter((_, el) => $(el).find('p.key').text().trim() === COUNTRY_LABEL)
    .first()
    .find('p.val')
    .text()
    .trim();
  return country || null;
}

async function getMovieDetail(id: string): Promise<Movie | null> {
  let html: string;
  try {
    html = await fetchHtml(MOVIE_URL(id));
  } catch (err) {
    console.warn(`Skipping multiplex movie ${id}: ${(err as Error).message}`);
    return null;
  }

  const $ = cheerio.load(html);
  const block = $('script[type="application/ld+json"]').first().html();
  if (!block) return null;

  const name = extractJsonLdField(block, 'name');
  if (!name) return null;

  const originalTitle = extractJsonLdField(block, 'alternativeHeadline');
  const releaseDate = extractJsonLdField(block, 'dateCreated');
  const country = extractCountry($);

  return {
    uaTitle: name,
    originalTitle: originalTitle ?? name,
    year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    countries: country ? [country] : [],
    shortDescription: extractJsonLdField(block, 'description'),
    posterUrl: extractJsonLdField(block, 'image'),
    imdbRating: null,
    cast: extractCast(block),
    releaseDate: releaseDate ?? null,
  };
}

export async function getMultiplexUpcoming(): Promise<Movie[]> {
  const ids = await getUpcomingMovieIds();
  const details = await mapWithConcurrency(ids, DETAIL_PAGE_CONCURRENCY, getMovieDetail);
  return details.filter((d): d is Movie => d !== null);
}

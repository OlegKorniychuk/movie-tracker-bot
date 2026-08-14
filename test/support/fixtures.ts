let nextUpdateId = 10000;

export function commandUpdate(chatId: number, text: string) {
  return {
    update_id: nextUpdateId++,
    message: {
      message_id: nextUpdateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'private' },
      from: { id: chatId, is_bot: false, first_name: 'Test' },
      text,
      entities: [
        { offset: 0, length: text.split(' ')[0]?.length ?? text.length, type: 'bot_command' },
      ],
    },
  };
}

export function callbackQueryUpdate(chatId: number, data: string) {
  return {
    update_id: nextUpdateId++,
    callback_query: {
      id: String(nextUpdateId),
      from: { id: chatId, is_bot: false, first_name: 'Test' },
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private' },
      },
      chat_instance: 'test-instance',
      data,
    },
  };
}

export interface PlanetakinoMovieFixture {
  name: string;
  originalName?: string | null;
  year?: number | null;
  countries?: string[];
  shortDescription?: string | null;
  posterUrl?: string | null;
  imdbRating?: number | null;
  cast?: { name: string; role: string }[];
  releaseDate: string; // YYYY-MM-DD
}

export function planetakinoResponse(movies: PlanetakinoMovieFixture[]) {
  return {
    data: {
      movies: {
        totalCount: movies.length,
        nodes: movies.map((m) => ({
          name: m.name,
          originalName: m.originalName ?? null,
          year: m.year ?? null,
          countries: m.countries ?? ['UA'],
          shortDescription: m.shortDescription ?? 'Опис фільму',
          posters: { vertical: [{ url: m.posterUrl ?? 'https://example.com/poster.jpg' }] },
          rating: { imdb: { rating: m.imdbRating ?? null } },
          credits: {
            nodes: (m.cast ?? [{ name: 'Тест Актор', role: 'Актор' }]).map((c) => ({
              roles: [{ name: c.role }],
              person: { name: c.name },
            })),
          },
          offlineRental: { start: `${m.releaseDate}T00:00:00Z` },
        })),
      },
    },
  };
}

const UKRAINIAN_MONTHS_GENITIVE = [
  'січня',
  'лютого',
  'березня',
  'квітня',
  'травня',
  'червня',
  'липня',
  'серпня',
  'вересня',
  'жовтня',
  'листопада',
  'грудня',
];

function formatUkrainianDayHeader(date: Date): string {
  return `${date.getUTCDate()} ${UKRAINIAN_MONTHS_GENITIVE[date.getUTCMonth()]}`;
}

export interface MultiplexSoonEntry {
  id: string;
  daysFromNow: number;
}

// Mirrors MultiplexSource's expected DOM: .soon_by_day > .soon_el, each with a
// p.el_day_date header ("D <genitive month>", no year) and a.soon_fm links.
// Dates are relative to "now" so fixtures never go stale.
export function soonPageHtml(entries: MultiplexSoonEntry[]): string {
  const byHeader = new Map<string, string[]>();
  for (const entry of entries) {
    const date = new Date(Date.now() + entry.daysFromNow * 24 * 60 * 60 * 1000);
    const header = formatUkrainianDayHeader(date);
    const ids = byHeader.get(header) ?? [];
    ids.push(entry.id);
    byHeader.set(header, ids);
  }

  const blocks = Array.from(byHeader.entries())
    .map(
      ([header, ids]) => `
        <div class="soon_el">
          <div class="el_left"><p class="el_day_date">${header}</p><p class="el_day_name">День</p></div>
          <div class="el_right">
            ${ids.map((id) => `<a href="/movie/${id}" class="soon_fm" title="Test ${id}"></a>`).join('\n')}
          </div>
        </div>`,
    )
    .join('\n');

  return `<div class="soon_by_day">${blocks}</div>`;
}

export interface MultiplexMovieFixture {
  name: string;
  originalTitle?: string;
  releaseDate: string; // YYYY-MM-DD
  description?: string;
  posterUrl?: string;
  country?: string;
}

// Mirrors the schema.org ld+json block MultiplexSource.getMovieDetail reads,
// plus the "Виробництво:" (country) row it scrapes separately from the DOM.
export function movieDetailHtml(movie: MultiplexMovieFixture): string {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: movie.name,
    alternativeHeadline: movie.originalTitle ?? movie.name,
    dateCreated: movie.releaseDate,
    description: movie.description ?? 'Опис фільму',
    image: movie.posterUrl ?? 'https://example.com/poster.jpg',
    director: { name: 'Тест Режисер' },
    actor: [{ name: 'Тест Актор' }],
  };

  return `<html><body>
    <script type="application/ld+json">${JSON.stringify(ld)}</script>
    <li><p class="key">Виробництво:</p><p class="val">${movie.country ?? 'США'}</p></li>
  </body></html>`;
}

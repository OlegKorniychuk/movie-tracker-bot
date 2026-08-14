import { http, HttpResponse } from 'msw';
import {
  movieDetailHtml,
  planetakinoResponse,
  soonPageHtml,
  type MultiplexMovieFixture,
  type PlanetakinoMovieFixture,
} from './fixtures.js';

export interface TelegramCall {
  method: 'sendMessage' | 'sendPhoto' | 'answerCallbackQuery';
  body: Record<string, unknown>;
}

export const telegramCalls: TelegramCall[] = [];

export function resetTelegramCalls(): void {
  telegramCalls.length = 0;
}

let nextMessageId = 1;

const telegramHandlers = [
  http.post('https://api.telegram.org/bot*/getMe', () =>
    HttpResponse.json({
      ok: true,
      result: { id: 1, is_bot: true, first_name: 'Test Bot', username: 'test_bot' },
    }),
  ),

  http.post('https://api.telegram.org/bot*/sendMessage', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    telegramCalls.push({ method: 'sendMessage', body });
    return HttpResponse.json({
      ok: true,
      result: { message_id: nextMessageId++, chat: { id: body.chat_id }, date: 0, text: body.text },
    });
  }),

  http.post('https://api.telegram.org/bot*/sendPhoto', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    telegramCalls.push({ method: 'sendPhoto', body });
    return HttpResponse.json({
      ok: true,
      result: { message_id: nextMessageId++, chat: { id: body.chat_id }, date: 0 },
    });
  }),

  http.post('https://api.telegram.org/bot*/answerCallbackQuery', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    telegramCalls.push({ method: 'answerCallbackQuery', body });
    return HttpResponse.json({ ok: true, result: true });
  }),
];

// Default: no movies. Override per test with `network.use(planetakinoHandler(movies))`.
const planetakinoHandlers = [
  http.post('https://api-mobile.planetakino.ua/graphql/movies', () =>
    HttpResponse.json({ data: { movies: { totalCount: 0, nodes: [] } } }),
  ),
];

// Default: empty listing pages. Override per test for the Multiplex-fallback cases.
const multiplexHandlers = [
  http.get('https://multiplex.ua/soon', () => HttpResponse.text('<div class="soon_by_day"></div>')),
];

export const defaultHandlers = [...telegramHandlers, ...planetakinoHandlers, ...multiplexHandlers];

// --- Per-test overrides, pass to network.use(...) ---

export function planetakinoSucceeds(movies: PlanetakinoMovieFixture[]) {
  return http.post('https://api-mobile.planetakino.ua/graphql/movies', () =>
    HttpResponse.json(planetakinoResponse(movies)),
  );
}

export function planetakinoFails() {
  return http.post(
    'https://api-mobile.planetakino.ua/graphql/movies',
    () => new HttpResponse(null, { status: 500 }),
  );
}

// entries: { id, daysFromNow } for the /soon listing; details: full movie fixtures keyed by id.
export function multiplexServes(
  entries: { id: string; daysFromNow: number }[],
  details: Record<string, MultiplexMovieFixture>,
) {
  return [
    http.get('https://multiplex.ua/soon', () => HttpResponse.text(soonPageHtml(entries))),
    http.get('https://multiplex.ua/movie/:id', ({ params }) => {
      const detail = details[params.id as string];
      if (!detail) return new HttpResponse(null, { status: 404 });
      return HttpResponse.text(movieDetailHtml(detail));
    }),
  ];
}

# ADR-0001: Planetakino-primary sourcing, Multiplex fallback-only, drop TMDB enrichment

## Status

Accepted

## Date

2026-08-14

## Context

The digest pipeline (`MovieAggregationService`, now `MovieSourceService`) queried Planetakino
and Multiplex concurrently every run, merged results by title (Planetakino winning collisions),
then ran `TmdbEnricher` on any movie still missing description/poster/countries/cast.

Two facts changed the calculus:

1. **Planetakino alone covers every field the bot needs.** Its GraphQL response
   (`PlanetakinoSource.ts`) already returns title, year, countries, description, poster,
   `imdbRating`, cast, and release date directly — confirmed by inspecting a live response.
   Multiplex's HTML scrape (`MultiplexSource.ts`) can't get `imdbRating` at all (hardcoded
   `null`) and gets countries as free-text UA labels rather than codes.
2. **The Cloudflare account is on the Workers Free plan**: hard-capped at 50 external
   subrequests per invocation. Multiplex's scraper does one detail-page fetch per movie; a live
   run against `/soon` pulled 84 ids → 85 requests in a single invocation, already over the cap
   on its own, before Planetakino's ~3 requests or any TMDB calls. `MovieAggregationService`
   queried both sources concurrently every run, so this budget was being spent even when
   Planetakino alone would've sufficed.

`docs/ideas/tmdb-release-date-validation.md` (2026-08-13) had already ruled TMDB out as a
release-date source and recommended it stay as a metadata-gap-filler. This ADR goes further: with
Planetakino confirmed to cover all metadata fields too, that gap-filling role has no live movies
left to apply to in the common case, since Multiplex — the only source that could leave gaps — is
no longer queried unless Planetakino has already failed outright.

## Decision

- Query **Planetakino only** in the normal case.
- Fall back to **Multiplex only if Planetakino's fetch throws**, logging a `console.warn` with the
  error and which fallback is being used (`MovieSourceService.ts`).
- **Stop calling TMDB** in the live path. `TmdbEnricher.ts`, the `MovieEnricher` interface, and
  `Movie.needsEnrichment()` / `mergeEnrichment()` stay in the repo, unwired — a reserve, not
  deleted, so re-enabling later doesn't require rebuilding the client. `env.TMDB_API_KEY` stays
  declared and the Cloudflare secret stays provisioned.
- **Shrink the digest lookahead window from 28 to 14 days** (`DigestService.DIGEST_WINDOW_DAYS`),
  and push that window into the fetch itself: `MultiplexSource` now parses each `.soon_el` block's
  day header (`p.el_day_date`, e.g. "20 серпня") and only fetches detail pages for movies inside
  the window, instead of scraping every listed id regardless of date. Measured effect: a 14-day
  window cut a fallback run from 85 requests to 17.

## Alternatives Considered

### Keep both sources always-on, just trim TMDB's scope

Rejected — doesn't touch the actual budget problem. Multiplex's always-on per-movie scrape was
already the thing blowing the subrequest cap; TMDB was a secondary contributor at best.

### Shrink `DIGEST_WINDOW_DAYS` without changing `MultiplexSource`

Tried first, found insufficient. `MultiplexSource.fetchUpcoming()` scraped every id off `/soon`
regardless of date — the digest window was only ever applied to the DB query, after upsert, well
after the 85 detail-page requests had already happened. A window change alone would not have
capped Multiplex's request count.

### Upgrade to Workers Paid plan ($5/mo → 10,000 subrequests)

Would make the original always-on, TMDB-enriched design viable again. Rejected for now in favor
of an architecture that works within the Free plan's limits — no ongoing cost, and Planetakino
alone is sufficient for the bot's needs.

## Consequences

- **Multiplex-exclusive titles are no longer surfaced in normal operation.** A same-window
  comparison of the two chains' catalogs found ~6 titles per cycle that only Multiplex lists
  (niche/limited releases). Since Multiplex is now fallback-only, those are missed unless
  Planetakino is down. Accepted: Planetakino's catalog is larger overall (confirmed ~104 vs. 80
  releases in the same window), so this is a minor tail-coverage loss, not a regression on the
  common case.
- **The digest's window/interval overlap safety net is gone.** The previous 28-day window against
  a 14-day send interval gave a 2-week buffer so a late-discovered or date-shifted movie still got
  caught by the next run. With window == interval == 14 days, that buffer no longer exists.
  Accepted as a reasonable trade: the earlier overlap existed partly to hedge against Multiplex's
  scrape being unreliable; Planetakino's GraphQL feed is closer to ground truth so the miss risk
  is lower than it was.
- Re-enabling TMDB enrichment later is a small, contained change: wire `TmdbEnricher` back into
  `MovieSourceService`'s construction in `buildApp.ts` and reintroduce a `needsEnrichment()` check
  — nothing else needs to change.

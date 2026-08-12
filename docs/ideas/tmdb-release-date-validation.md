# TMDB Release Date Validation — Findings

## Context

`cinema-tracker-bot.md` flagged as an unvalidated assumption: "TMDB has usable UA theatrical
`release_dates` for most relevant titles." This doc records the spot-check that resolved it, by
comparing TMDB against two Ukrainian cinema chains (Planetakino, Multiplex) for a 4-week window
(2026-08-12 to 2026-09-09).

This was a one-off spike (comparison script since removed); the numbers below are a point-in-time
snapshot, not something this repo can re-run. The source modules it was built on
(`src/sources/{tmdb,planetakino,multiplex}.ts`) remain, since they're the actual data layer the
bot needs going forward.

## Finding: TMDB is not a valid release-date source for this bot

63 real UA cinema releases in the window (from Planetakino + Multiplex, which agree closely with
each other on dates). Only **15 (23.8%)** had a correct TMDB UA release date.

Upstream cause: `discover/movie` with `region=UA` + `primary_release_date` filtering doesn't
actually restrict results to UA-specific dates — it returned 1202 "candidate" titles for the same
window, of which only 23 had any real UA entry in `movie/{id}/release_dates` at all. The `region`
param does not reliably filter by country; most candidates share one generic date mirrored across
dozens of unrelated countries.

Breakdown of the 63 cinema releases against TMDB:

- **~40 missing from TMDB discover entirely** — mostly small/arthouse/local Ukrainian titles TMDB
  has thin or no data on, plus **re-releases** (Shrek, Cars, both Harry Potter Deathly Hallows
  films back in cinemas) — these have a real TMDB entry, but their `release_date` is years old, so
  a forward-looking discover window structurally can't surface them. Different failure mode than
  "bad data": TMDB has no concept of "back in theaters."
- **~5 title found in TMDB, no UA entry in `release_dates` at all.**
- **~3 date mismatch** — TMDB's UA date off by up to a week from the actual cinema date (e.g.
  "The End of Oak Street": cinema 2026-08-20, TMDB says 2026-08-13).
- **15 match** — mostly bigger/wider titles.

## Recommendation

Don't use TMDB as the release-date source for the weekly digest. Use it only for supplementary
metadata once a movie is already known from a cinema-chain source: director, cast, genre, country,
runtime, poster/rating, etc. — data TMDB is good at and the cinema chains don't reliably expose.

Primary release-date source should be the cinema chains themselves:

- **Planetakino** — open, unauthenticated GraphQL API
  (`https://api-mobile.planetakino.ua/graphql/movies`), confirmed working. `statusOffline:
PUBLISHED_AT_ANNOUNCED` gives the "coming soon" catalog; `offlineRental(cinemaId).start` gives
  the real per-cinema screening date. `originalName` field is a clean match key for cross-source
  joins (e.g. against TMDB for metadata lookup). No nationwide aggregate — queried per `cinemaId`.
- **Multiplex** — no public API, but `https://multiplex.ua/soon` is static server-rendered HTML,
  scrape-friendly, one page covers ~6 months of upcoming releases nationwide (chain-wide, not
  per-location like Planetakino). Detail pages (`/movie/{id}`) carry a schema.org JSON-LD block
  with original title (`alternativeHeadline`) and date (`dateCreated`) — note the JSON-LD is not
  always strict-valid JSON on this site (missing commas seen in practice), so field-level regex
  extraction is more robust than `JSON.parse`.

Both chains agreed closely with each other on release dates in this sample, which is why they're
usable as ground truth here.

## Open Questions

- Only sampled 2 of the larger UA chains. Worth checking whether other major chains
  (Планета Кіно's own site directly, Кінопалац, Multiplex vs. others) diverge before picking one
  as the bot's single source of truth, or whether chain-agreement itself becomes the trust signal.
- Re-releases (older titles back in cinemas) aren't handled by a TMDB-search-by-upcoming-date
  approach at all — if the bot wants to support those, matching needs to happen by title lookup
  (TMDB `search/movie`), not `discover`, once the cinema-chain source already names the movie.
- This changes the MVP's "TMDB client: fetch UA theatrical releases" line in
  `cinema-tracker-bot.md` — that TMDB client's job shifts to metadata enrichment for movies
  already sourced from a cinema chain, not release discovery itself.

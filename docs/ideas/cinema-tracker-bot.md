# Cinema Release Tracker Telegram Bot

## Context

Repo is a fresh Node/TS skeleton (`movie-tracker-bot`) with tooling set up but no
application code yet. This is the first feature idea for it: a personal Telegram
bot that surfaces upcoming cinema releases (Ukraine market) weekly, lets the user
pick which ones they care about, and reminds them when a picked movie actually
hits theaters — so they stop missing releases they wanted to catch on the big
screen.

## Problem Statement

How might we help someone discover upcoming cinema releases and get reminded
exactly when a movie they care about opens — without manually checking listings?

## Recommended Direction

Keep the original scope, tightened by the clarifying answers: region = Ukraine
theatrical releases, storage keyed by Telegram `chat_id` from day one (so adding
a second user later is a config change, not a rewrite — no group features yet,
just cheap future-proofing), and a two-touch reminder (heads-up a few days
before release, plus a day-of ping).

Loop:

1. **Weekly digest** — cron job queries TMDB for movies with a UA theatrical
   release date in the next ~2-3 weeks, posts them to the user's Telegram chat
   with inline "🎬 Want to watch" buttons, skipping movies already shown in a
   prior digest.
2. **Pick** — tapping the button stores the movie (tmdb_id, title, release_date,
   chat_id) as tracked.
3. **Reminder** — daily job checks tracked movies: if `release_date` is ~3 days
   out, send a heads-up; if it's today, send the day-of reminder. Re-fetch the
   movie's release date from TMDB at check time (not just the stored value) in
   case TMDB's date shifted since it was picked.

Variations considered and explicitly not folded in (see "Not Doing"): filtered
digest by director/franchise, group/multi-user coordination, leaving-soon
alerts, showtime/booking integration, taste-ranked digest ordering. All were
raised and rejected in favor of shipping the tight original loop first.

## Key Assumptions to Validate

- [x] ~~TMDB has usable UA theatrical `release_dates` for most relevant titles~~ —
      **invalidated**, see `tmdb-release-date-validation.md`. Only 23.8% of real UA
      cinema releases had a correct TMDB UA date in a 4-week spot-check. Use
      Planetakino/Multiplex as the release-date source; TMDB is still good for
      supplementary metadata (director, cast, genre, country) once a movie is
      already identified.
- [ ] Telegram inline keyboards are sufficient UX for picking movies from a
      weekly list (no mini-app needed) — validate by prototyping one digest
      message with buttons.
- [ ] A daily cron re-checking release dates catches postponements without
      double-sending reminders — needs explicit "reminder already sent at this
      stage" state per movie, not just a date diff.

## MVP Scope

**In:**

- TMDB client: fetch UA theatrical releases for an upcoming window.
- Weekly scheduled job → Telegram digest message(s) with inline pick buttons.
- Persistent store (SQLite, given single-process personal scale) of tracked
  picks keyed by `chat_id`: tmdb_id, title, release_date, reminder-stage flags.
- Daily scheduled job → heads-up (T-3 days) and day-of reminder sends.
- Dedupe so previously-digested movies aren't re-shown weekly.

**Out (this pass):** multi-user UI/group coordination, showtimes/booking
links, taste-based digest ranking, franchise/director subscriptions,
leaving-soon alerts.

## Not Doing (and Why)

- **Group/friends coordination** — real value, but doubles scope (sharing,
  overlap detection). Ship the solo loop first; `chat_id`-keyed storage means
  this isn't blocked later, just deferred.
- **Showtimes/ticket booking integration** — no reliable single API for UA
  cinema chains; "it's out, go check" is enough for MVP.
- **Taste-ranked/filtered digest** — flat chronological list is simpler and
  good enough until the weekly list proves too noisy in practice.
- **Leaving-soon reminder** — different pain (missed window vs. forgot it
  opened); worth adding once the arrival-reminder loop is proven useful.

## Open Questions

- Where does the scheduled job run 24/7 (VPS + node-cron, GitHub Actions
  scheduled workflow, Railway/Fly.io cron)?
- What's the actual digest window — next 1 week, 2 weeks, or a month of UA
  releases? Affects how noisy/useful the weekly message feels.
- Does TMDB's UA coverage hold up under the spot-check above, or does the
  region assumption need a fallback?

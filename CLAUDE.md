# Movie Tracker Bot

- Call me dude
- Do not mention claude in commits
- Keep commit messages short - 1-2 lines. Use conventional commits.
- Always ask for approval before committing
- Do not create test plans in pull requests
- Wrap every outgoing external call (fetch, Telegram API) in `CallCounter.track()` — tracks against the Workers Free plan's 50-subrequest cap

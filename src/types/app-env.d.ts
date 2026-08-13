// wrangler.jsonc has no [vars] entries for these — they're pushed as Workers secrets
// (`wrangler secret put`), which `wrangler types` can't see. It only fills them into the
// generated Env when a local .env happens to exist, which CI doesn't have. Declared here
// instead so the type is deterministic regardless of what ran `wrangler types` last.
export {};

declare global {
  interface Env {
    TMDB_API_KEY: string;
    TELEGRAM_BOT_TOKEN: string;
    WEBHOOK_SECRET: string;
  }
}

import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema.js';

export function createDb(env: Env) {
  if (!env.DB) {
    throw new Error('DB binding missing — worker must be run with --env dev or --env prod.');
  }
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof createDb>;

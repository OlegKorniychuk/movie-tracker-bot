import { drizzle } from 'drizzle-orm/d1';
import type { Env } from '../worker.js';
import * as schema from './schema.js';

export function createDb(env: Env) {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof createDb>;

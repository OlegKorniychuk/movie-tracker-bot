import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { meta } from '../db/schema.js';

const LAST_DIGEST_KEY = 'last_digest_at';

export class DigestStateRepository {
  constructor(private readonly db: Db) {}

  async getLastDigestAt(): Promise<string | null> {
    const [row] = await this.db.select().from(meta).where(eq(meta.key, LAST_DIGEST_KEY));
    return row?.value ?? null;
  }

  async setLastDigestAt(isoDateTime: string): Promise<void> {
    await this.db
      .insert(meta)
      .values({ key: LAST_DIGEST_KEY, value: isoDateTime })
      .onConflictDoUpdate({ target: meta.key, set: { value: isoDateTime } });
  }
}

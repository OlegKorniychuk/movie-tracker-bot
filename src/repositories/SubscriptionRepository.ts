import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { subscriptions } from '../db/schema.js';

export class SubscriptionRepository {
  constructor(private readonly db: Db) {}

  async add(chatId: number): Promise<void> {
    await this.db.insert(subscriptions).values({ chatId }).onConflictDoNothing();
  }

  async remove(chatId: number): Promise<void> {
    await this.db.delete(subscriptions).where(eq(subscriptions.chatId, chatId));
  }

  async list(): Promise<number[]> {
    const rows = await this.db.select({ chatId: subscriptions.chatId }).from(subscriptions);
    return rows.map((row) => row.chatId);
  }
}

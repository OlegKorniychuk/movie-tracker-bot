import type { ActivePick } from '../repositories/TrackedPickRepository.js';
import { TrackedPickRepository } from '../repositories/TrackedPickRepository.js';

// Thin on purpose — same reasoning as SubscriptionService: keeps the bot
// layer from ever importing a repository directly.
export class PickService {
  constructor(private readonly trackedPickRepo: TrackedPickRepository) {}

  async pick(chatId: number, movieId: number): Promise<void> {
    await this.trackedPickRepo.create(chatId, movieId);
  }

  async cancel(pickId: number, chatId: number): Promise<void> {
    await this.trackedPickRepo.cancel(pickId, chatId);
  }

  async listActive(chatId: number): Promise<ActivePick[]> {
    return this.trackedPickRepo.listActiveForChat(chatId);
  }
}

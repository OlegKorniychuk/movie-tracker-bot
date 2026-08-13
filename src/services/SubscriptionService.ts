import { SubscriptionRepository } from '../repositories/SubscriptionRepository.js';

// Thin on purpose — its whole job is to be the one thing the bot layer talks
// to, so command handlers never import a repository directly.
export class SubscriptionService {
  constructor(private readonly subscriptionRepo: SubscriptionRepository) {}

  async subscribe(chatId: number): Promise<void> {
    await this.subscriptionRepo.add(chatId);
  }

  async unsubscribe(chatId: number): Promise<void> {
    await this.subscriptionRepo.remove(chatId);
  }
}

import { messages } from '../bot/messages.js';
import type { TelegramBotApp } from '../bot/TelegramBotApp.js';
import type { Logger } from '../logging/Logger.js';
import { TrackedPickRepository } from '../repositories/TrackedPickRepository.js';

export class ReminderService {
  constructor(
    private readonly trackedPickRepo: TrackedPickRepository,
    private readonly telegramBotApp: TelegramBotApp,
    private readonly logger: Logger,
  ) {}

  async run(): Promise<void> {
    const today = this.todayIsoDate();
    const due = await this.trackedPickRepo.findDueReminders(today);

    if (due.length === 0) {
      this.logger.info('Reminders: nothing due today');
      return;
    }

    const sentPickIds: number[] = [];
    for (const pick of due) {
      try {
        await this.telegramBotApp.sendMessage(pick.chatId, messages.pickReminder(pick.uaTitle));
        sentPickIds.push(pick.pickId);
      } catch (err) {
        this.logger.error('Failed to send reminder', { pickId: pick.pickId, error: err });
      }
    }

    if (sentPickIds.length > 0) {
      await this.trackedPickRepo.markNotified(sentPickIds, new Date().toISOString());
    }
  }

  private todayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }
}

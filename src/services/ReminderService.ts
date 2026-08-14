import { messages } from '../bot/messages.js';
import type { TelegramBotApp } from '../bot/TelegramBotApp.js';
import { TrackedPickRepository } from '../repositories/TrackedPickRepository.js';

export class ReminderService {
  constructor(
    private readonly trackedPickRepo: TrackedPickRepository,
    private readonly telegramBotApp: TelegramBotApp,
  ) {}

  async run(): Promise<void> {
    const today = this.todayIsoDate();
    const due = await this.trackedPickRepo.findDueReminders(today);

    if (due.length === 0) {
      console.log('Reminders: nothing due today');
      return;
    }

    const sentPickIds: number[] = [];
    for (const pick of due) {
      try {
        await this.telegramBotApp.sendMessage(pick.chatId, messages.pickReminder(pick.uaTitle));
        sentPickIds.push(pick.pickId);
      } catch (err) {
        console.error(`Failed to send reminder for pick ${pick.pickId}:`, err);
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
